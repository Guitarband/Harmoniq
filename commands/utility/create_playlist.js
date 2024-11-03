const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const Token = require('../../models/token');
const renewSpotifyToken = require('../../hooks/renewSpotifyToken');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('create_playlist')
      .setDescription('Create a playlist on your spotify account')
      .addStringOption(option =>
        option.setName('name')
          .setDescription('The name of the playlist')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('type')
          .setDescription('Visibility of the playlist')
          .setRequired(false)
          .addChoices(
            {name: 'Public', value: 'public'},
            {name: 'Private', value: 'private'},
            {name: 'Collaborative', value: 'collaborative'}
          )
      ),

    async execute(interaction){
        const name = interaction.options.getString('name')
        const playlistType = interaction.options.getString('type') || 'Public'
        const discordId = interaction.user.id

        try{
            const userToken = await Token.findOne({discordId: discordId})
            if(!userToken) {
                return await interaction.reply({
                  content:`You have not connected your spotify account with Sbotify`,
                  ephemeral: true
                })
            }

            let accessToken = userToken.accessToken
            let refreshToken = userToken.refreshToken

            let response;
            try{
                let userData = await axios.get(`https://api.spotify.com/v1/me`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

                response = await axios.post(`https://api.spotify.com/v1/users/${userData.data.id}/playlists`, {
                    name: name,
                    public: playlistType === 'Public',
                    collaborative: playlistType === 'Collaborative'
                },{
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                })
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
                        });

                        response = await axios.post(`https://api.spotify.com/v1/users/${userData.data.id}/playlists`, {
                            name: name,
                            public: playlistType === 'Public',
                            collaborative: playlistType === 'Collaborative'
                        },{
                            headers: {
                                Authorization: `Bearer ${accessToken}`
                            }
                        })
                    } catch (error){
                        console.error(error)
                        return await interaction.reply({
                            content:`An error occurred while trying to create the playlist`,
                            ephemeral: true
                        })
                    }
                }
            }

            await interaction.reply({
                content: `Playlist [**${response.data.name}**](${response.data.external_urls.spotify}) has been created.`,
                ephemeral: false
            })
        } catch (error){
            console.error(error)
            return await interaction.reply({
                content:`An error occurred while trying to create the playlist`,
                ephemeral: true
            })
        }
    }
}