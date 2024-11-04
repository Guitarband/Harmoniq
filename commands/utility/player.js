const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const axios = require('axios');
const Token = require('../../models/token');
const renewSpotifyToken = require('../../hooks/renewSpotifyToken');

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
                  .setDescription('You have not connected your Spotify account with Sbotify to use this command')
                  .setTimestamp();
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (userToken.scopes !== process.env.spotify_scopes) {
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Authorization Lost')
                  .setDescription('Sbotify has lost authorization to your account. Please use /connect_spotify to reauthorize.')
                  .setTimestamp();
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            let accessToken = userToken.accessToken;
            let response;
            let userData;

            try {
                userData = await axios.get('https://api.spotify.com/v1/me', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                })
                response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
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

                    response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    });
                } else {
                    console.error(error);
                    return await interaction.reply({
                        content: 'An error occurred while trying to fetch your Spotify account.',
                        ephemeral: true
                    });
                }
            }

            let embed;
            if (response.data && response.data.is_playing) {
                const track = response.data.item;
                const currentPosition = Math.floor(response.data.progress_ms / 1000);
                const totalDuration = Math.floor(track.duration_ms / 1000);
                const currentMinutes = Math.floor(currentPosition / 60);
                const currentSeconds = currentPosition % 60;
                const totalMinutes = Math.floor(totalDuration / 60);
                const totalSeconds = totalDuration % 60;
                const formattedCurrentPosition = `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')}`;
                const formattedTotalDuration = `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;

                embed = new EmbedBuilder()
                  .setColor('#1DB954')
                  .setTitle(`${track.name}`)
                  .setDescription(`By: ${track.artists.map(artist => artist.name).join(', ')} \n Album: [${track.album.name}](${track.album.external_urls.spotify})`)
                  .setThumbnail(track.album.images[0].url)
                  .setURL(track.external_urls.spotify)
                  .addFields(
                    { name: 'Current Position', value: `${formattedCurrentPosition} / ${formattedTotalDuration}`, inline: true },
                    { name: 'Shuffle', value: response.data.shuffle_state ? 'On' : 'Off', inline: true }
                  )
                  .setTimestamp();
            } else {
                embed = new EmbedBuilder()
                  .setColor('#1DB954')
                  .setTitle(`Player Paused`)
                  .setDescription(`Your spotify account is not playing any tracks at the moment`)
                  .setTimestamp();
            }

            if (userData.data.product !== 'premium') {
                const buttons = new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(`shuffle:${response.data.shuffle_state ? 'false' : 'true'}_${discordId}`)
                      .setLabel('⇄')
                      .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                      .setCustomId(`previous_${discordId}`)
                      .setLabel('⏮')
                      .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                      .setCustomId(`playback_${discordId}`)
                      .setLabel('⏯')
                      .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                      .setCustomId(`next_${discordId}`)
                      .setLabel('⏭')
                      .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                      .setCustomId(`repeat:${
                          response.data.repeat_state === 'off' ? 'context' : 
                            response.data.repeat_state === 'context' ? 'track' : 'off'}_${discordId}`)
                      .setLabel('↺')
                      .setStyle(ButtonStyle.Secondary)
                  );

                await interaction.reply({ embeds: [embed], components: [buttons] });
            } else {
                return await interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error(error);
            return await interaction.reply({
                content: 'An error occurred while trying to fetch your Spotify account.',
                ephemeral: true
            });
        }
    }
};
