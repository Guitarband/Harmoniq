const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const path = require('path');

function buildPlayer(userData, response, discordId) {
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
          .setThumbnail('attachment://SpotifyLogo.png')
          .setImage(track.album.images[0].url)
          .setURL(track.external_urls.spotify)
          .addFields(
            { name: 'Current Position', value: `${formattedCurrentPosition} / ${formattedTotalDuration}`, inline: true },
            { name: 'Shuffle', value: response.data.shuffle_state ? 'On' : 'Off', inline: true }
          )
          .setTimestamp();
    } else if (response.data.device.is_private_session && response.data.device.is_active) {
        embed = new EmbedBuilder()
          .setColor('#1DB954')
          .setTitle(`Private Session Active`)
          .setDescription(`Your spotify account is currently in a private session and as such data cannot be displayed.`)
          .setThumbnail('attachment://SpotifyLogo.png')
          .setTimestamp();
    } else {
        embed = new EmbedBuilder()
          .setColor('#1DB954')
          .setTitle(`Player Paused`)
          .setDescription(`Your spotify account is not playing any tracks at the moment.`)
          .setThumbnail('attachment://SpotifyLogo.png')
          .setTimestamp();
    }

    let embedData = { embeds: [embed], files:[{
            attachment: path.join(__dirname, '../assets/SpotifyLogo.png'),
            name: 'SpotifyLogo.png'
        }]  };

    if (userData.data.product === 'premium') {
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

        embedData.components = [buttons]}
    return embedData
}

module.exports = buildPlayer;