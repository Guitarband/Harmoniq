const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const Token = require('../../models/Token');
const renewSpotifyToken = require('../../hooks/renewSpotifyToken');
const path = require("path");

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('top')
      .setDescription('Display your top tracks or artists')
      .addStringOption(option =>
        option.setName('type')
          .setDescription('The type of top list')
          .setRequired(true)
          .addChoices(
            {name: 'Tracks', value: 'tracks'},
            {name: 'Artists', value: 'artists'}
          )
        )
      .addStringOption(option =>
        option.setName('time_range')
          .setDescription('Select the time range for the top items')
          .setRequired(true)
          .addChoices(
            { name: 'Last 4 Weeks', value: 'short_term' },
            { name: 'Last 6 Months', value: 'medium_term' },
            { name: 'Last Year', value: 'long_term' }
          )),
    async execute(interaction){
        const type = interaction.options.getString('type')
        const time_range = interaction.options.getString('time_range')
        const discordId = interaction.user.id

        await interaction.deferReply()

        try {
            const userToken = await Token.findOne({discordId: discordId})
            if(!userToken) {
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Not Connected')
                  .setDescription('You have not connected your spotify account with Harmoniq to use this command')
                  .setTimestamp()
                return await interaction.reply({ embeds: [embed], ephemeral: true })
            }

            if(userToken.scopes !== process.env.spotify_scopes){
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Authorization lost')
                  .setDescription('Harmoniq has lost authorization to your account due to an update. Please use /connect_spotify to reauthorize.')
                  .setTimestamp()
                return await interaction.reply({ embeds: [embed], ephemeral: true })
            }

            let accessToken = userToken.accessToken
            let refreshToken = userToken.refreshToken

            let response;
            try{
                response = await axios.get(`https://api.spotify.com/v1/me/top/${type}?time_range=${time_range}&limit=10`, {
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

                        response = await axios.get(`https://api.spotify.com/v1/me/top/${type}?time_range=${time_range}&limit=10`, {
                            headers: {
                                Authorization: `Bearer ${accessToken}`
                            }
                        })
                    } catch (error){
                        console.error(error)
                        return await interaction.reply({
                            content:`An error occurred while trying to fetch your spotify account`,
                            ephemeral: true
                        })
                    }

                }
                else{
                    console.error(error)
                    return await interaction.reply({
                        content:`An error occurred while trying to fetch your spotify account`,
                        ephemeral: true
                    })
                }
            }
            const items = response.data.items

            const embed = new EmbedBuilder()
              .setColor('#1DB954')
              .setTitle(`Your Top ${type === 'tracks' ? 'Tracks' : 'Artists'} in the last ${time_range === 'short_term' ? '4 Weeks' : time_range === 'medium_term' ? '6 Months' : 'Year'}`)
              .setThumbnail('attachment://SpotifyLogo.png')
              .setTimestamp()

            items.forEach((item, index) => {
                const artists = item.artists.map(artist => artist.name).join(', ')
                embed.addFields({
                    name: `${index + 1}. ${item.name}`,
                    value: `[${artists.length > 0 ? artists : 'Unknown Artist'}](${item.external_urls.spotify})`,
                    inline: false
                })
            })

            await interaction.editReply({ embeds: [embed], files:[{
                    attachment: path.join(__dirname, '../../assets/SpotifyLogo.png'),
                    name: 'SpotifyLogo.png'
                }]
            })
        }catch (error){
            console.error(error)
            return await interaction.editReply({
                content:`An error occurred while trying to fetch your spotify account`,
                ephemeral: true
            })
        }
    }
}