const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const Token = require('../../models/Token');
const renewSpotifyToken = require('../../hooks/renewSpotifyToken');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('add')
      .setDescription('Add a song to your playlist')
      .addStringOption(option =>
        option.setName('playlist')
          .setDescription('Name of the playlist')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('song')
          .setDescription('Name of the Song')
          .setRequired(true)
      ),
    async execute(interaction) {
        const playlistName = interaction.options.getString('playlist');
        const songQuery = interaction.options.getString('song');
        const discordId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            const userToken = await Token.findOne({ discordId });
            if (!userToken) {
                await interaction.deleteReply();
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Not Connected')
                  .setDescription('You have not connected your Spotify account with Harmoniq to use this command.')
                  .setTimestamp();
                return await interaction.followUp({ embeds: [embed], ephemeral: true });
            }

            if(userToken.scopes !== process.env.spotify_scopes){
                await interaction.deleteReply();
                const embed = new EmbedBuilder()
                  .setColor('#950013')
                  .setTitle('Account Authorization lost')
                  .setDescription('Harmoniq has lost authorization to your account due to an update. Please use /connect_spotify to reauthorize.')
                  .setTimestamp()
                return await interaction.followUp({ embeds: [embed], ephemeral: true })
            }

            let accessToken = userToken.accessToken;
            let refreshToken = userToken.refreshToken;

            async function searchForPlaylist(accessToken, offset) {
                const response = await axios.get(`https://api.spotify.com/v1/me/playlists?limit=50&offset=${offset}`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
                return response.data;
            }

            async function findPlaylist(accessToken, playlistName, inviterId) {
                let index = 0;
                while (true) {
                    const playlists = await searchForPlaylist(accessToken, index * 50);
                    const playlist = playlists.items.find(p => p.name === playlistName && p.owner.id === inviterId);
                    if (playlist) return playlist;
                    if (!playlists.next) return null;
                    index++;
                }
            }

            let playlist;
            try {
                const userData = await axios.get(`https://api.spotify.com/v1/me`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
                playlist = await findPlaylist(accessToken, playlistName, userData.data.id);
            } catch (error) {
                if (error.response?.status === 401) {
                    const refreshResponse = await renewSpotifyToken(refreshToken);
                    accessToken = refreshResponse.data.access_token;
                    refreshToken = refreshResponse.data.refresh_token;

                    await Token.findOneAndUpdate(
                      { discordId },
                      { accessToken, refreshToken, retrievedAt: new Date() },
                      { new: true }
                    );

                    const userData = await axios.get(`https://api.spotify.com/v1/me`, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    });
                    playlist = await findPlaylist(accessToken, playlistName, userData.data.id);
                } else {
                    throw error;
                }
            }

            if (!playlist) {
                await interaction.editReply('Playlist not found.');
                return;
            }

            const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(songQuery)}&type=track&limit=5`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            const tracks = response.data.tracks.items;
            if (tracks.length === 0) {
                await interaction.editReply('Song not found.');
                return;
            }

            const buttons = tracks.map((track, index) =>
              new ButtonBuilder()
                .setLabel(track.name)
                .setCustomId(`add_song_${index}`)
                .setStyle(ButtonStyle.Primary)
            );

            const cancelButton = new ButtonBuilder()
                .setLabel('Cancel')
                .setCustomId('cancel')
                .setStyle(ButtonStyle.Danger)

            const songRow = new ActionRowBuilder().addComponents(buttons);
            const cancelRow = new ActionRowBuilder().addComponents(cancelButton);

            const embed = new EmbedBuilder()
              .setColor('#1DB954')
              .setTitle('Select a song to add:')
              .setDescription(tracks.map((track, index) => `**${index + 1}**: ${track.name} by ${track.artists.map(artist => artist.name).join(', ')}`).join('\n'));

            await interaction.editReply({ embeds: [embed], components: [songRow, cancelRow] });

            const filter = i => i.customId.startsWith('add_song_') || i.customId === 'cancel';
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

            collector.on('collect', async i => {
                if (i.customId === 'cancel') {
                    await i.deleteReply();
                    collector.stop();
                    return;
                }

                const trackIndex = parseInt(i.customId.split('_')[2]);
                const selectedTrack = tracks[trackIndex];

                await axios.post(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
                    uris: [selectedTrack.uri]
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

                await i.reply({ content: `Added "${selectedTrack.name}" to the playlist.`, ephemeral: true });
                collector.stop();
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.deleteReply()
                    interaction.followUp({ content: 'No selection made, operation timed out.', ephemeral: true });
                }
            });

        } catch (error) {
            console.error(error);
            await interaction.deleteReply();
            const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('Error')
              .setDescription('An error occurred while trying to add the song to your playlist.')
              .setTimestamp();
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        }
    }
};
