require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');  // <-- Faltava isso

const app = express();

// Servir a pasta front corretamente
app.use(express.static(path.join(__dirname, "front")));

const port = process.env.PORT || 3000;

// Rota para a home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "front", "landPage.html"));
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
