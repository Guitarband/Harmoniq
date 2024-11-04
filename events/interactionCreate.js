const { Events, EmbedBuilder} = require('discord.js')
const axios = require('axios')
const Token = require('../models/token')
const renewSpotifyToken = require('../hooks/renewSpotifyToken')
const {response} = require("express");

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        async function handlePlaybackInteraction(task, accessToken) {
            const [task, state] = interaction.customId.split(':')

            if (task === 'previous') {
                await axios.post('https://api.spotify.com/v1/me/player/previous', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
            } else if (task === 'next') {
                await axios.post('https://api.spotify.com/v1/me/player/next', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
            } else if (task === 'pause') {
                await axios.put('https://api.spotify.com/v1/me/player/pause', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

            } else if (task === 'resume') {
                await axios.put('https://api.spotify.com/v1/me/player/play', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

            } else if (task === 'repeat') {
                await axios.post('https://api.spotify.com/v1/me/player/repeat', {
                    state: state === 'track' ? 'off' : state === 'off' ? 'context' : 'track',
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
            } else if (task === 'shuffle') {
                await axios.put('https://api.spotify.com/v1/me/player/shuffle', {
                    state: state === 'true',
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
            }
        }

        if (interaction.isButton()) {
            const [task, discordId] = interaction.customId.split('_')
            if (interaction.user.id !== discordId) {
                return await interaction.reply(
                  {content: 'You cannot interact with another user\'s player', ephemeral: true}
                )
            }
            try {
                const userToken = await Token.findOne({discordId: discordId})
                if (!userToken || userToken.scopes !== process.env.spotify_scopes) {
                    const embed = new EmbedBuilder()
                      .setColor('#950013')
                      .setTitle('Account Authorization Lost')
                      .setDescription('Sbotify has lost authorization to your account. Please use /connect_spotify to reauthorize.')
                      .setTimestamp();
                    return await interaction.reply({embeds: [embed], ephemeral: true});
                }
                let accessToken = userToken.accessToken
                let refreshToken = userToken.refreshToken

                try {
                    const playbackResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    });

                    const isPlaying = playbackResponse.data && playbackResponse.data.is_playing;

                    const task = (task === 'playback' && isPlaying) ? 'pause' : 'resume'

                    await handlePlaybackInteraction(task, accessToken)

                    const responseAction = task.endsWith('e') ? task.slice(0, -1) : task
                    return await interaction.reply(
                      {content: `Successfully ${responseAction}ed the song`, ephemeral: true}
                    )
                } catch (error) {
                    if (error.response.status === 401) {
                        const refreshResponse = await renewSpotifyToken(refreshToken)
                        accessToken = refreshResponse.data.access_token
                        refreshToken = refreshResponse.data.refresh_token

                        await Token.findOneAndUpdate(
                          {discordId: discordId},
                          {accessToken: accessToken, refreshToken: refreshToken, retrievedAt: new Date()},
                          {new: true}
                        )
                        const playbackResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                            headers: {
                                Authorization: `Bearer ${accessToken}`
                            }
                        });

                        const isPlaying = playbackResponse.data && playbackResponse.data.is_playing;

                        const task = (task === 'playback' && isPlaying) ? 'pause' : 'resume'

                        await handlePlaybackInteraction(task, accessToken)

                        const responseAction = task.endsWith('e') ? task.slice(0, -1) : task
                        return await interaction.reply(
                          {content: `Successfully ${responseAction}ed the song`, ephemeral: true}
                        )
                    } else{
                        console.error(error)
                        return await interaction.reply(
                          {content: 'An error occurred while trying to fetch your spotify account', ephemeral: true}
                        )
                    }
                }
            } catch (error) {
                console.error(error)
                return await interaction.reply(
                  {content: 'An error occurred while trying to fetch your spotify account', ephemeral: true}
                )
            }
        }

        if (!interaction.isChatInputCommand()) return

        const command = interaction.client.commands.get(interaction.commandName)
        if (!command) return

        try {
            await command.execute(interaction)
        } catch (error) {
            console.error(error)
            await interaction.reply({content: 'There was an error while executing this command!', ephemeral: true})
        }
    }
}