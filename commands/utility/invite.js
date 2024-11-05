const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const Token = require('../../models/Token');
const renewSpotifyToken = require('../../hooks/renewSpotifyToken');
const path = require("path");

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('invite')
      .setDescription('Invite a user to your collaborative playlist')
      .addStringOption(option =>
        option.setName('playlist')
          .setDescription('Name of the playlist')
          .setRequired(true)
      )
      .addUserOption(option =>
        option.setName('user')
          .setDescription('User to invite')
          .setRequired(true)
      ),
    async execute(interaction){
        const userToInvite = interaction.options.getUser('user')
        const discordId = interaction.user.id
        const playlistName = interaction.options.getString('playlist')

        await interaction.deferReply({ ephemeral: true })

        try{
            function findPlaylistByName(playlists, playlistName, inviterId){
                return playlists.find(playlist =>
                  playlist.name === playlistName &&
                  playlist.owner.id === inviterId
                )
            }

            async function searchForPlaylist(accessToken, offset){
                let response = await axios.get(`https://api.spotify.com/v1/me/playlists?limit=${50}&offset=${offset}`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                })

                return response.data
            }

            async function findPlaylist(accessToken, playlistName, inviterId){
                let index = 0
                while (true){
                    let playlists = await searchForPlaylist(accessToken, index*50)
                    let playlist = findPlaylistByName(playlists.items, playlistName, inviterId)
                    if(playlist){
                        return playlist
                    }
                    if(playlists.next === null){
                        return null
                    }
                    index++
                }
            }

            const userToken = await Token.findOne({discordId: discordId})
            if(!userToken) {
                await interaction.deleteReply()
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Not Connected')
                  .setDescription('You have not connected your spotify account with Harmoniq to use this command')
                  .setTimestamp()
                return await interaction.followUp({ embeds: [embed], ephemeral: true })
            }

            if(userToken.scopes !== process.env.spotify_scopes){
                await interaction.deleteReply()
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Authorization lost')
                  .setDescription('Harmoniq has lost authorization to your account due to an update. Please use /connect_spotify to reauthorize.')
                  .setTimestamp()
                return await interaction.followUp({ embeds: [embed], ephemeral: true })
            }

            let accessToken = userToken.accessToken
            let refreshToken = userToken.refreshToken

            let response;
            try{
                let userData = await axios.get(`https://api.spotify.com/v1/me`,  {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                })
                response = await findPlaylist(accessToken, playlistName, userData.data.id)
            }catch (error){
                if(error.response.status === 401){
                    try {
                        const refreshResponse = await renewSpotifyToken(refreshToken)

                        accessToken = refreshResponse.data.access_token
                        refreshToken = refreshResponse.data.refresh_token

                        await Token.findOneAndUpdate(
                          {discordId: discordId},
                          {accessToken: accessToken, refreshToken: refreshToken, retrievedAt: new Date()},
                          {new: true}
                        )

                        let userData = await axios.get(`https://api.spotify.com/v1/me`, {
                            headers: {
                                Authorization: `Bearer ${accessToken}`
                            }
                        })
                        response = await findPlaylist(accessToken, playlistName, userData.data.id)
                    } catch (error){
                        console.error(error)
                        await interaction.deleteReply()
                        const embed = new EmbedBuilder()
                            .setColor('#950013')
                            .setTitle('Error')
                            .setDescription('An error occurred while trying to find the specified playlist')
                            .setTimestamp()

                        return await interaction.followUp({ embeds: [embed], ephemeral: true })
                    }
                }
            }

            if(!response){
                await interaction.deleteReply()
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Error')
                  .setDescription('An error occurred while trying to find the specified playlist')
                  .setTimestamp()

                return await interaction.followUp({ embeds: [embed], ephemeral: true })
            }

            const inviteLink = `https://open.spotify.com/playlist/${response.id}`

            await interaction.editReply(`Playlist found! Attempting to invite.`)

            try {
                if(response.collaborative) {
                    const inviteEmbed = new EmbedBuilder()
                      .setColor('#1DB954')
                      .setThumbnail('attachment://SpotifyLogo.png')
                      .setTitle(`You've been invited to **"${playlistName}"**`)
                      .setDescription(`You've been invited to a collaborative playlist by ${interaction.user.username}!\n\n[Invite Harmoniq to your own servers](https://discord.com/api/oauth2/authorize?client_id=1301820770162315307&permissions=0&scope=bot%20applications.commands)`)
                      .setTimestamp();

                    const button = new ButtonBuilder()
                      .setLabel('Accept')
                      .setStyle(ButtonStyle.Link)
                      .setURL(inviteLink)

                    const row = new ActionRowBuilder()
                      .addComponents(button)

                    await userToInvite.send({embeds: [inviteEmbed], components: [row], files:[{
                            attachment: path.join(__dirname, '../assets/SpotifyLogo.png'),
                            name: 'SpotifyLogo.png'
                        }]
                    })

                    await interaction.deleteReply()

                    const embed = new EmbedBuilder()
                      .setColor('#00FF00')
                      .setTitle(`Invitation sent to ${userToInvite.username}`)
                      .setThumbnail('attachment://SpotifyLogo.png')
                      .setTimestamp();

                    await interaction.followUp({embeds: [embed], ephemeral: true, files:[{
                            attachment: path.join(__dirname, '../../assets/SpotifyLogo.png'),
                            name: 'SpotifyLogo.png'
                        }]
                    });
                }
                else{
                    await interaction.deleteReply()

                    const embed = new EmbedBuilder()
                      .setColor('#00FF00')
                      .setTitle('Invalid Playlist')
                      .setDescription(`The playlist **"${playlistName}"** is not a collaborative playlist`)
                      .setTimestamp();

                    await interaction.followUp({embeds: [embed], ephemeral: true});
                }
            }catch (error){
                console.error(error)
                await interaction.deleteReply()
                if(error.code === 50007){
                    const embed = new EmbedBuilder()
                      .setColor('#FF0000')
                      .setTitle('DM Error')
                      .setDescription(`Could not send a DM to ${userToInvite.username}. They may have DMs disabled. Invite link: ${inviteLink}`)
                      .setTimestamp();

                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                }else {
                    const embed = new EmbedBuilder()
                      .setColor('#FF0000')
                      .setTitle('Error')
                      .setDescription(`An error occurred while trying to invite ${userToInvite.username} to the playlist`)
                      .setTimestamp();

                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                }
            }
        } catch (error){
            console.error(error)
            await interaction.deleteReply()
            const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('Error')
              .setDescription(`An error occurred while trying to invite ${userToInvite.username} to the playlist`)
              .setTimestamp();

            await interaction.followUp({ embeds: [embed], ephemeral: true });
        }
    }
}