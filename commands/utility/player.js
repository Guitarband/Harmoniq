const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const axios = require('axios');
const Token = require('../../models/token');
const renewSpotifyToken = require('../../hooks/renewSpotifyToken');
const buildPlayer = require('../../hooks/buildPlayer');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('player')
      .setDescription('Display the currently playing track'),
    async execute(interaction) {
        const discordId = interaction.user.id;

        try {
            const userToken = await Token.findOne({ discordId: discordId });
            if (!userToken) {
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Not Connected')
                  .setDescription('You have not connected your Spotify account with Harmoniq to use this command')
                  .setTimestamp();
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (userToken.scopes !== process.env.spotify_scopes) {
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Authorization Lost')
                  .setDescription('Harmoniq has lost authorization to your account due to an update. Please use /connect_spotify to reauthorize.')
                  .setTimestamp();
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            let accessToken = userToken.accessToken;
            let userData;
            try {
                userData = await axios.get('https://api.spotify.com/v1/me', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                })
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    const refreshResponse = await renewSpotifyToken(userToken.refreshToken);
                    accessToken = refreshResponse.data.access_token;

                    await Token.findOneAndUpdate(
                      { discordId: discordId },
                      { accessToken: accessToken, refreshToken: refreshResponse.data.refresh_token, retrievedAt: new Date() },
                      { new: true }
                    );

                    userData = await axios.get('https://api.spotify.com/v1/me', {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    })
                } else {
                    console.error(error);
                    return await interaction.reply({
                        content: 'An error occurred while trying to fetch your Spotify account.',
                        ephemeral: true
                    });
                }
            }

            let response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            return await interaction.reply(buildPlayer(userData, response, discordId));
        } catch (error) {
            console.error(error);
            return await interaction.reply({
                content: 'An error occurred while trying to fetch your Spotify account.',
                ephemeral: true
            });
        }
    }
};
