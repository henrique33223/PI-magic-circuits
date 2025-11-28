require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const nodemailer = require('nodemailer');
const session = require('express-session');
const app = express();

const db = new sqlite3.Database('./meubanco.db');
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "front")));

// SESSIONS CONFIGURADAS CORRETAMENTE
app.use(session({
  secret: process.env.SESSION_SECRET || 'magic-circuits-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    httpOnly: true
  }
}));

// MIDDLEWARE para verificar se está logado
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Não autorizado. Faça login primeiro.' });
  }
};

// MIDDLEWARE para obter dados do usuário
const getUserData = (req, res, next) => {
  if (req.session && req.session.userId) {
    // Busca dados atualizados do usuário no banco
    db.get("SELECT id, nome, email FROM login WHERE id = ?", [req.session.userId], (err, user) => {
      if (err || !user) {
        req.user = null;
      } else {
        req.user = user;
      }
      next();
    });
  } else {
    req.user = null;
    next();
  }
};

app.use(getUserData);

// Criar tabelas (seu código atual permanece)
db.run(`CREATE TABLE IF NOT EXISTS login(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  senha TEXT NOT NULL
)`);

// Criar tabela principal
db.run(`CREATE TABLE IF NOT EXISTS projetos_arqueologicos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  localizacao TEXT,
  data_inicio DATE,
  data_termino DATE,
  data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
  data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(usuario_id) REFERENCES login(id) ON DELETE CASCADE
)`);

// Adicionar colunas de dimensões se não existirem
db.run(`ALTER TABLE projetos_arqueologicos ADD COLUMN largura_m DECIMAL(10,2)`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Erro ao adicionar coluna largura_m:', err);
  }
});

db.run(`ALTER TABLE projetos_arqueologicos ADD COLUMN altura_m DECIMAL(10,2)`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Erro ao adicionar coluna altura_m:', err);
  }
});

db.run(`ALTER TABLE projetos_arqueologicos ADD COLUMN escala INTEGER DEFAULT 100`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Erro ao adicionar coluna escala:', err);
  }
});

db.run(`CREATE TABLE IF NOT EXISTS areas_sitio(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  coordenadas TEXT,
  cor TEXT DEFAULT '#FF0000',
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  FOREIGN KEY(projeto_id) REFERENCES projetos_arqueologicos(id) ON DELETE CASCADE
)`);

db.run(`CREATE TABLE IF NOT EXISTS artefatos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT,
  descricao TEXT,
  profundidade_cm DECIMAL(10,2),
  coordenadas TEXT,
  data_descoberta DATE DEFAULT CURRENT_DATE,
  foto_url TEXT,
  observacoes TEXT,
  estado_conservacao TEXT,
  material TEXT,
  dimensoes TEXT,
  FOREIGN KEY(area_id) REFERENCES areas_sitio(id) ON DELETE CASCADE
)`);

const port = process.env.PORT || 3000;

// ROTA DE LOGIN MODIFICADA
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM login WHERE email = ?", [email], async (err, row) => {
    if (err) {
      console.error('Erro no banco:', err);
      return res.status(500).json({ error: 'Erro no servidor' });
    }
    
    if (!row) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    const match = await bcrypt.compare(password, row.senha);
    if (!match) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    // CRIA A SESSÃO
    req.session.userId = row.id;
    req.session.userEmail = row.email;
    req.session.userName = row.nome;

    console.log('Sessão criada para usuário:', row.email);

    res.json({ 
      success: true,
      message: 'Login realizado com sucesso',
      user: {
        id: row.id,
        nome: row.nome,
        email: row.email
      }
    });
  });
});

// ROTA PARA OBTER DADOS DO USUÁRIO LOGADO
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.session.userId,
      nome: req.session.userName,
      email: req.session.userEmail
    }
  });
});

// ROTA DE LOGOUT
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erro ao destruir sessão:', err);
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    
    res.clearCookie('connect.sid'); // Limpa o cookie da sessão
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  });
});

// SUAS ROTAS EXISTENTES (modificadas para usar sessions)
app.post('/salvarData', async (req, res) => {
  try {
    const { nome, email, password } = req.body;
    
    if (!nome || !email || !password) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;
    const hashPassword = await bcrypt.hash(password, saltRounds);
    
    db.run(
      "INSERT INTO login (nome, email, senha) VALUES (?, ?, ?)",
      [nome, email, hashPassword],
      function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ error: "Erro ao salvar usuário" });
        }
        res.json({ 
          success: true, 
          message: "Usuário salvo com sucesso",
          userId: this.lastID 
        });
      }
    );
  } catch (error) {
    console.error('Erro no servidor:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// ROTAS ARQUEOLÓGICAS PROTEGIDAS
app.get('/api/projetos', requireAuth, (req, res) => {
  db.all(
    "SELECT * FROM projetos_arqueologicos WHERE usuario_id = ? ORDER BY data_criacao DESC",
    [req.session.userId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao buscar projetos:', err);
        return res.status(500).json({ error: 'Erro ao buscar projetos' });
      }
      res.json({ projetos: rows });
    }
  );
});

app.post('/api/projetos', requireAuth, (req, res) => {
  const { nome, descricao, localizacao, largura_m, altura_m, escala } = req.body;
  
  // Valores padrão se não forem fornecidos
  const largura = largura_m || 10.0;  // 10 metros padrão
  const altura = altura_m || 8.0;     // 8 metros padrão
  const escalaValor = escala || 50;   // 50 pixels por metro padrão

  db.run(
      `INSERT INTO projetos_arqueologicos 
       (usuario_id, nome, descricao, localizacao, largura_m, altura_m, escala) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.session.userId, nome, descricao, localizacao, largura, altura, escalaValor],
      function(err) {
          if (err) {
              console.error('Erro ao criar projeto:', err);
              return res.status(500).json({ error: 'Erro ao criar projeto' });
          }
          
          res.json({ 
              success: true, 
              message: 'Projeto criado com sucesso',
              projetoId: this.lastID 
          });
      }
  );
});
// ROTA DO DASHBOARD PROTEGIDA
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'dashboard.html'));
});

// SUAS OUTRAS ROTAS EXISTENTES PERMANECEM
app.post('/enviarC', (req, res) => {
  // ... seu código atual ...
});

app.post('/validarC', (req, res) => {
  // ... seu código atual ...
});

app.get('/go_login2', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'login2.html'));
});

app.get('/go_entrar', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'entrar.html'));
});

app.get('/nav', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'nav.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "front", "landPage.html"));
});
// Rota para deletar projeto
app.delete('/api/projetos/:id', requireAuth, (req, res) => {
  const projetoId = req.params.id;
  
  // Primeiro verifica se o projeto pertence ao usuário
  db.get(
      "SELECT * FROM projetos_arqueologicos WHERE id = ? AND usuario_id = ?",
      [projetoId, req.session.userId],
      (err, projeto) => {
          if (err) {
              console.error('Erro ao verificar projeto:', err);
              return res.status(500).json({ error: 'Erro interno do servidor' });
          }
          
          if (!projeto) {
              return res.status(404).json({ error: 'Projeto não encontrado ou não pertence ao usuário' });
          }
          
          // Deleta o projeto (o CASCADE vai deletar áreas e artefatos automaticamente)
          db.run(
              "DELETE FROM projetos_arqueologicos WHERE id = ?",
              [projetoId],
              function(err) {
                  if (err) {
                      console.error('Erro ao deletar projeto:', err);
                      return res.status(500).json({ error: 'Erro ao deletar projeto' });
                  }
                  
                  res.json({ 
                      success: true, 
                      message: 'Projeto deletado com sucesso',
                      projetoId: projetoId
                  });
              }
          );
      }
  );
});

// Rota para a página de edição do projeto
app.get('/editor/:projetoId', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'editor.html'));
});

// Rota para pegar dados de um projeto específico
app.get('/api/projetos/:id', requireAuth, (req, res) => {
  const projetoId = req.params.id;
  
  db.get(
      "SELECT * FROM projetos_arqueologicos WHERE id = ? AND usuario_id = ?",
      [projetoId, req.session.userId],
      (err, projeto) => {
          if (err) {
              console.error('Erro ao buscar projeto:', err);
              return res.status(500).json({ error: 'Erro interno' });
          }
          
          if (!projeto) {
              return res.status(404).json({ error: 'Projeto não encontrado' });
          }
          
          res.json({ success: true, projeto });
      }
  );
});
// Carregar projeto - ATUALIZADA
async function carregarProjeto() {
  try {
      const urlParams = new URLSearchParams(window.location.search);
      const projetoId = urlParams.get('id') || window.location.pathname.split('/').pop();
      
      if (projetoId && projetoId !== 'editor.html') {
          // Usa a rota completa que inclui áreas e artefatos
          const response = await fetch(`/api/projetos/${projetoId}/completo`);
          
          if (response.ok) {
              const data = await response.json();
              projetoAtual = data.projeto;
              areas = data.areas || [];
              artefatos = data.artefatos || [];
              console.log('Projeto carregado:', projetoAtual.nome, areas.length, 'áreas', artefatos.length, 'artefatos');
          } else {
              throw new Error('Projeto não encontrado na API');
          }
      } else {
          // Projeto novo ou demo
          projetoAtual = {
              id: 'demo-' + Date.now(),
              nome: "Sítio Arqueológico Demo",
              largura_m: 20,
              altura_m: 15,
              escala: 50
          };
          areas = [];
          artefatos = [];
      }
  } catch (error) {
      console.error('Erro ao carregar projeto:', error);
      // Usar dados padrão para demonstração
      projetoAtual = {
          id: 'demo-' + Date.now(),
          nome: "Sítio Arqueológico Demo",
          largura_m: 20,
          altura_m: 15,
          escala: 50
      };
      areas = [];
      artefatos = [];
  }
  
  inicializarEditor();
}
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});