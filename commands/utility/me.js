const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const Token = require('../../models/token');
const renewSpotifyToken = require('../../hooks/renewSpotifyToken');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('me')
      .setDescription('Display your spotify account')
    ,
    async execute(interaction){
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
                response = await axios.get('https://api.spotify.com/v1/me', {
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

                        response = await axios.get(`https://api.spotify.com/v1/me`, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`
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
            const userData = response.data
            const responseMessage = `
- **Username:** ${userData.display_name || 'N/A'}
- **Followers:** ${userData.followers.total}
            `
            const embed = new EmbedBuilder()
              .setColor('#1DB954')
              .setTitle('Account')
              .setDescription(responseMessage)
              .setThumbnail(userData.images.length ? userData.images[0].url : null)
              .setURL(userData.external_urls.spotify)
              .setTimestamp()

            await interaction.reply({ embeds: [embed] })
        }catch (error){
            console.error(error)
            return await interaction.reply({
                content:`An error occurred while trying to fetch your spotify account`,
                ephemeral: true
            })
        }
    }
}