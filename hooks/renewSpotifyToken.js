const axios = require('axios');

function renewSpotifyToken(refreshToken) {
    return axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.spotify_client_id,
        client_secret: process.env.spotify_client_secret
    }).toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    })
}

module.exports = renewSpotifyToken