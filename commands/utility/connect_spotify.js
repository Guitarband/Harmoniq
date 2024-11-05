const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require('discord.js');
const querystring = require("node:querystring");
const Token = require('../../models/token');

module.exports = {
    cooldown: 60,
    data: new SlashCommandBuilder()
      .setName('connect_spotify')
      .setDescription('Connect your Spotify account to use the bot')
    ,
    async execute(interaction){
        try {
            const userToken = await Token.findOne({discordId: interaction.user.id})

            if (userToken && userToken.scopes === process.env.spotify_scopes) {
                const embed = new EmbedBuilder()
                  .setColor('#1DB954')
                  .setTitle('Account Connected')
                  .setDescription('Your account is already connected to Harmoniq')
                  .setTimestamp()

                return await interaction.reply({ embeds: [embed], ephemeral: true })
            }

            const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
                client_id: process.env.spotify_client_id,
                response_type: 'code',
                redirect_uri: process.env.spotify_redirect_uri,
                scope: `${process.env.spotify_scopes}`,
                state: interaction.user.id
            })}`

            const embed = new EmbedBuilder()
              .setColor('#1DB954')
              .setTitle('Connect to Spotify')
              .setDescription('Press the button to allow Harmoniq to interact with your Spotify account')
              .setTimestamp()

            const button = new ButtonBuilder()
              .setLabel('Connect')
              .setStyle(ButtonStyle.Link)
              .setURL(authUrl)

            const row = new ActionRowBuilder()
              .addComponents(button)

            await interaction.reply({ embeds: [embed], components:[row], ephemeral: true })

        } catch (error) {
            console.error(error)
            return await interaction.reply(`An error occurred while trying to fetch your spotify account`)
        }
    }
}