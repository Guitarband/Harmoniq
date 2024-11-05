const fs = require('node:fs')
const path = require('node:path')
const { Client, Events, GatewayIntentBits, Collection } = require('discord.js')
const express = require('express')
const axios = require('axios')
const mongoose = require('mongoose')
const dotenv = require('dotenv')
dotenv.config()

const Token = require('./models/Token')

mongoose.connect(process.env.mongodb_uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
      console.error(error)
      process.exit(1)
  })

const app = express()
const port = 5173
const client = new Client({intents: [GatewayIntentBits.Guilds]})

client.commands = new Collection()
client.cooldowns = new Collection()
const foldersPath = path.join(__dirname, 'commands')
const commandFolders = fs.readdirSync(foldersPath)

for(const folder of commandFolders){
    const commandsPath = path.join(foldersPath, folder)
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))
    for(const file of commandFiles){
        const filePath = path.join(commandsPath,file)
        const command = require(filePath)
        if('data' in command && 'execute' in command){
            client.commands.set(command.data.name, command)
        }else{
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property`)
        }
    }
}

const eventsPath = path.join(__dirname, 'events')
const eventsFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'))
for(const file of eventsFiles){
    const filePath = path.join(eventsPath,file)
    const event = require(filePath)
    if(event.once){
        client.once(event.name, (...args) => event.execute(...args))
    }else{
        client.on(event.name, (...args) => event.execute(...args))
    }
}

app.get('/callback', async(req, res) => {
    const { code, state } = req.query
    try{
        const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.spotify_redirect_uri,
            client_id: process.env.spotify_client_id,
            client_secret: process.env.spotify_client_secret
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const { access_token, refresh_token, expires_in } = tokenResponse.data

        await Token.findOneAndUpdate(
          { discordId: state },
          { accessToken: access_token, refreshToken: refresh_token, scopes: process.env.spotify_scopes, expiresIn: expires_in, retrievedAt: new Date() },
          { upsert: true, new: true }
        )
        res.send('Successfully authenticated with Spotify! You can now close this tab')
    }catch(error){
        console.error(error)
        res.status(500).send(`An error occurred while authenticating with Spotify: ${error}`)
    }
})

client.login(process.env.discord_token)

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})