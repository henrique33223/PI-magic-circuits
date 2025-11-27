require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();

// ✅ CORREÇÃO: "Database" estava escrito errado
const db = new sqlite3.Database('./meubanco.db');

// ✅ CORREÇÃO: Adicionar middleware para parse do JSON
app.use(express.json());
app.use(express.static(path.join(__dirname, "front")));

// Criar tabela
db.run(`CREATE TABLE IF NOT EXISTS login(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  senha TEXT NOT NULL
)`);

const port = process.env.PORT || 3000;

// Rota para a home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "front", "landPage.html"));
});

app.post('/salvarData', async (req, res) => {
  try {
    const { nome, email, password } = req.body;
    
    // ✅ Validação dos campos
    if (!nome || !email || !password) {
      return res.status(400).send("Todos os campos são obrigatórios");
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;
    const hashPassword = await bcrypt.hash(password, saltRounds);
    
    db.run(
      "INSERT INTO login (nome, email, senha) VALUES (?, ?, ?)",
      [nome, email, hashPassword],
      function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).send("Erro ao salvar usuário");
        }
        // ✅ Enviar resposta JSON para o frontend
        res.json({ 
          success: true, 
          message: "Usuário salvo com sucesso",
          userId: this.lastID 
        });
      }
    );
  } catch (error) {
    console.error('Erro no servidor:', error);
    res.status(500).send("Erro interno do servidor");
  }
});

app.get('/go_login2', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'login2.html'));
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});