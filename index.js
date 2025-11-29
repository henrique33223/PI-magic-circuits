require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const nodemailer = require('nodemailer');
const session = require('express-session');
const app = express();

const db = new sqlite3.Database('./meubanco.db');

// Configurar email (se necessário)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, "front")));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'arqueomap-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    httpOnly: true,
    secure: false // Mude para true em produção com HTTPS
  }
}));

// Middlewares
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Não autorizado. Faça login primeiro.' });
  }
};

const redirectIfLoggedIn = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
};

const getUserData = (req, res, next) => {
  if (req.session && req.session.userId) {
    db.get("SELECT id, nome, email FROM login WHERE id = ?", [req.session.userId], (err, user) => {
      if (err || !user) {
        req.user = null;
        req.session.destroy();
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

// Criar tabelas
db.serialize(() => {
  // Tabela de usuários
  db.run(`CREATE TABLE IF NOT EXISTS login(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de projetos
  db.run(`CREATE TABLE IF NOT EXISTS projetos_arqueologicos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    localizacao TEXT,
    largura_m DECIMAL(10,2) DEFAULT 20.0,
    altura_m DECIMAL(10,2) DEFAULT 15.0,
    escala INTEGER DEFAULT 50,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(usuario_id) REFERENCES login(id) ON DELETE CASCADE
  )`);

  // Tabela de áreas
  db.run(`CREATE TABLE IF NOT EXISTS areas_sitio(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    coordenadas TEXT,
    cor TEXT DEFAULT '#4caf50',
    ordem INTEGER DEFAULT 0,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(projeto_id) REFERENCES projetos_arqueologicos(id) ON DELETE CASCADE
  )`);

  // Tabela de artefatos
  db.run(`CREATE TABLE IF NOT EXISTS artefatos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT DEFAULT 'artefato',
    material TEXT DEFAULT 'ceramica',
    descricao TEXT,
    profundidade_cm DECIMAL(10,2) DEFAULT 0,
    coordenadas TEXT,
    estado_conservacao TEXT DEFAULT 'Bom',
    dimensoes TEXT,
    data_descoberta DATE DEFAULT CURRENT_DATE,
    observacoes TEXT,
    data_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(area_id) REFERENCES areas_sitio(id) ON DELETE CASCADE
  )`);
});

const port = process.env.PORT || 3000;

// ========== ROTAS DE AUTENTICAÇÃO ==========
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

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

    // Criar sessão
    req.session.userId = row.id;
    req.session.userEmail = row.email;
    req.session.userName = row.nome;

    console.log('✅ Login realizado:', row.email);

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

app.post('/salvarData', async (req, res) => {
  try {
    const { nome, email, password } = req.body;
    
    if (!nome || !email || !password) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;
    const hashPassword = await bcrypt.hash(password, saltRounds);
    
    db.run(
      "INSERT INTO login (nome, email, senha) VALUES (?, ?, ?)",
      [nome, email, hashPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: "Email já cadastrado" });
          }
          console.error('Erro ao salvar usuário:', err);
          return res.status(500).json({ error: "Erro ao salvar usuário" });
        }
        
        // Logar automaticamente após cadastro
        req.session.userId = this.lastID;
        req.session.userEmail = email;
        req.session.userName = nome;

        res.json({ 
          success: true, 
          message: "Usuário cadastrado com sucesso",
          userId: this.lastID,
          user: {
            id: this.lastID,
            nome: nome,
            email: email
          }
        });
      }
    );
  } catch (error) {
    console.error('Erro no servidor:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erro ao destruir sessão:', err);
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ 
      loggedIn: true, 
      user: {
        id: req.session.userId,
        nome: req.session.userName,
        email: req.session.userEmail
      }
    });
  } else {
    res.json({ loggedIn: false });
  }
});

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

// ========== ROTAS DE PROJETOS ==========
app.get('/api/projetos', requireAuth, (req, res) => {
  db.all(
    `SELECT id, nome, descricao, localizacao, largura_m, altura_m, escala,
            data_criacao, data_atualizacao
     FROM projetos_arqueologicos 
     WHERE usuario_id = ? 
     ORDER BY data_atualizacao DESC`,
    [req.session.userId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao buscar projetos:', err);
        return res.status(500).json({ error: 'Erro ao buscar projetos' });
      }
      
      // Buscar contagem de áreas e artefatos para cada projeto
      if (rows.length === 0) {
        return res.json({ projetos: [] });
      }

      const projetosComStats = rows.map(projeto => {
        return new Promise((resolve) => {
          // Contar áreas
          db.get(
            "SELECT COUNT(*) as count FROM areas_sitio WHERE projeto_id = ?",
            [projeto.id],
            (err, areaResult) => {
              if (err) {
                projeto.areas_count = 0;
                projeto.artefatos_count = 0;
                resolve(projeto);
                return;
              }

              // Contar artefatos
              db.get(
                `SELECT COUNT(*) as count FROM artefatos a
                 JOIN areas_sitio ar ON a.area_id = ar.id
                 WHERE ar.projeto_id = ?`,
                [projeto.id],
                (err, artefatoResult) => {
                  projeto.areas_count = areaResult.count;
                  projeto.artefatos_count = artefatoResult ? artefatoResult.count : 0;
                  resolve(projeto);
                }
              );
            }
          );
        });
      });

      Promise.all(projetosComStats)
        .then(projetos => {
          res.json({ success: true, projetos: projetos });
        })
        .catch(error => {
          console.error('Erro ao calcular estatísticas:', error);
          res.json({ success: true, projetos: rows });
        });
    }
  );
});

app.post('/api/projetos', requireAuth, (req, res) => {
  const { nome, descricao, localizacao, largura_m, altura_m, escala } = req.body;
  
  if (!nome) {
    return res.status(400).json({ error: 'Nome do projeto é obrigatório' });
  }

  const largura = largura_m || 20.0;
  const altura = altura_m || 15.0;
  const escalaValor = escala || 50;

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
      
      const projetoId = this.lastID;
      
      res.json({ 
        success: true, 
        message: 'Projeto criado com sucesso',
        projetoId: projetoId
      });
    }
  );
});

app.get('/api/projetos/:id', requireAuth, (req, res) => {
  const projetoId = req.params.id;
  
  db.get(
    `SELECT id, nome, descricao, localizacao, largura_m, altura_m, escala,
            data_criacao, data_atualizacao
     FROM projetos_arqueologicos 
     WHERE id = ? AND usuario_id = ?`,
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

// ROTA COMPLETA DO PROJETO (COM ÁREAS E ARTEFATOS)
app.get('/api/projetos/:id/completo', requireAuth, (req, res) => {
  const projetoId = req.params.id;
  
  console.log('🔍 Buscando projeto completo:', projetoId);
  
  // Buscar projeto básico
  db.get(
    `SELECT id, nome, descricao, localizacao, largura_m, altura_m, escala,
            data_criacao, data_atualizacao
     FROM projetos_arqueologicos 
     WHERE id = ? AND usuario_id = ?`,
    [projetoId, req.session.userId],
    (err, projeto) => {
      if (err) {
        console.error('Erro ao buscar projeto:', err);
        return res.status(500).json({ error: 'Erro interno' });
      }
      
      if (!projeto) {
        return res.status(404).json({ error: 'Projeto não encontrado' });
      }

      // Buscar áreas do projeto
      db.all(
        "SELECT * FROM areas_sitio WHERE projeto_id = ? ORDER BY ordem",
        [projetoId],
        (err, areas) => {
          if (err) {
            console.error('Erro ao buscar áreas:', err);
            return res.status(500).json({ error: 'Erro ao buscar áreas' });
          }

          // Processar áreas para parsear coordenadas
          const areasProcessadas = areas.map(area => {
            if (area.coordenadas) {
              try {
                const coords = JSON.parse(area.coordenadas);
                return { ...area, ...coords };
              } catch (e) {
                console.error('Erro ao parsear coordenadas da área:', e);
                return area;
              }
            }
            return area;
          });

          // Buscar artefatos
          db.all(
            `SELECT a.*, ar.nome as area_nome 
             FROM artefatos a 
             LEFT JOIN areas_sitio ar ON a.area_id = ar.id 
             WHERE ar.projeto_id = ?`,
            [projetoId],
            (err, artefatos) => {
              if (err) {
                console.error('Erro ao buscar artefatos:', err);
                return res.status(500).json({ error: 'Erro ao buscar artefatos' });
              }

              // Processar artefatos para parsear coordenadas
              const artefatosProcessados = artefatos.map(artefato => {
                if (artefato.coordenadas) {
                  try {
                    const coords = JSON.parse(artefato.coordenadas);
                    return { ...artefato, ...coords };
                  } catch (e) {
                    console.error('Erro ao parsear coordenadas do artefato:', e);
                    return artefato;
                  }
                }
                return artefato;
              });

              res.json({ 
                success: true, 
                projeto: projeto,
                areas: areasProcessadas,
                artefatos: artefatosProcessados
              });
            }
          );
        }
      );
    }
  );
});

// ROTA PARA ATUALIZAR PROJETO (SALVAR)
app.put('/api/projetos/:id', requireAuth, (req, res) => {
  const projetoId = req.params.id;
  const { nome, descricao, localizacao, largura_m, altura_m, escala, areas, artefatos } = req.body;
  
  console.log('💾 SALVANDO PROJETO:', {
    projetoId: projetoId,
    nome: nome,
    areas: areas ? areas.length : 0,
    artefatos: artefatos ? artefatos.length : 0
  });

  // Verificar se o projeto pertence ao usuário
  db.get(
    "SELECT id FROM projetos_arqueologicos WHERE id = ? AND usuario_id = ?",
    [projetoId, req.session.userId],
    (err, projeto) => {
      if (err) {
        console.error('❌ Erro ao verificar projeto:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
      
      if (!projeto) {
        console.error('❌ Projeto não encontrado ou não pertence ao usuário');
        return res.status(404).json({ error: 'Projeto não encontrado' });
      }

      // Atualizar dados básicos do projeto
      db.run(
        `UPDATE projetos_arqueologicos 
         SET nome = ?, descricao = ?, localizacao = ?, 
             largura_m = ?, altura_m = ?, escala = ?, 
             data_atualizacao = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nome, descricao, localizacao, largura_m, altura_m, escala, projetoId],
        function(err) {
          if (err) {
            console.error('❌ Erro ao atualizar projeto:', err);
            return res.status(500).json({ error: 'Erro ao atualizar projeto' });
          }

          console.log('✅ Projeto básico atualizado');

          // Processar áreas e artefatos
          salvarAreasEArtefatos(projetoId, areas || [], artefatos || [])
            .then(() => {
              console.log('✅ Todas áreas e artefatos salvas');
              res.json({ 
                success: true, 
                message: 'Projeto salvo com sucesso',
                projetoId: projetoId
              });
            })
            .catch(error => {
              console.error('❌ Erro ao salvar áreas/artefatos:', error);
              res.status(500).json({ 
                success: false, 
                error: 'Projeto salvo, mas houve erro nas áreas/artefatos' 
              });
            });
        }
      );
    }
  );
});

// FUNÇÃO PARA SALVAR ÁREAS E ARTEFATOS
function salvarAreasEArtefatos(projetoId, areas, artefatos) {
  return new Promise((resolve, reject) => {
    console.log('📦 Processando áreas e artefatos...');
    
    // 1. Limpar áreas existentes (CASCADE vai limpar artefatos automaticamente)
    db.run("DELETE FROM areas_sitio WHERE projeto_id = ?", [projetoId], (err) => {
      if (err) {
        console.error('❌ Erro ao limpar áreas:', err);
        reject(err);
        return;
      }

      console.log('✅ Áreas antigas removidas');

      // 2. Se não há áreas, terminar aqui
      if (areas.length === 0) {
        console.log('ℹ️ Nenhuma área para salvar');
        resolve();
        return;
      }

      // 3. Inserir novas áreas
      const areaPromises = areas.map((area, index) => {
        return new Promise((resolveArea, rejectArea) => {
          const coordenadas = JSON.stringify({
            x: area.x || 0,
            y: area.y || 0, 
            largura: area.largura || 100,
            altura: area.altura || 100,
            largura_m: area.largura_m || 2,
            altura_m: area.altura_m || 2
          });
          
          db.run(
            `INSERT INTO areas_sitio 
             (projeto_id, nome, descricao, coordenadas, cor, ordem) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [projetoId, area.nome, area.descricao || '', coordenadas, '#4caf50', index],
            function(err) {
              if (err) {
                console.error('❌ Erro ao inserir área:', err, area);
                rejectArea(err);
              } else {
                const areaId = this.lastID;
                console.log(`✅ Área salva: ${area.nome} (ID: ${areaId})`);
                
                // 4. Salvar artefatos desta área
                const artefatosDaArea = artefatos.filter(artefato => 
                  artefato.area_id === area.id || artefato.area === area.nome
                );
                
                salvarArtefatosDaArea(areaId, artefatosDaArea)
                  .then(() => resolveArea())
                  .catch(rejectArea);
              }
            }
          );
        });
      });

      Promise.all(areaPromises)
        .then(() => {
          console.log('✅ Todas áreas e artefatos processadas');
          resolve();
        })
        .catch(reject);
    });
  });
}

// FUNÇÃO PARA SALVAR ARTEFATOS DE UMA ÁREA
function salvarArtefatosDaArea(areaId, artefatos) {
  return new Promise((resolve, reject) => {
    if (artefatos.length === 0) {
      resolve();
      return;
    }

    console.log(`🎯 Salvando ${artefatos.length} artefatos para área ${areaId}`);

    const artefatoPromises = artefatos.map(artefato => {
      return new Promise((resolveArtefato, rejectArtefato) => {
        const coordenadas = JSON.stringify({
          x: artefato.x || 0,
          y: artefato.y || 0
        });
        
        db.run(
          `INSERT INTO artefatos 
           (area_id, nome, tipo, material, descricao, profundidade_cm, coordenadas, estado_conservacao, dimensoes, observacoes) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            areaId,
            artefato.nome,
            artefato.tipo || 'artefato',
            artefato.material || 'ceramica',
            artefato.descricao || '',
            artefato.profundidade || artefato.profundidade_cm || 0,
            coordenadas,
            artefato.estado_conservacao || 'Bom',
            artefato.dimensoes || '',
            artefato.observacoes || ''
          ],
          function(err) {
            if (err) {
              console.error('❌ Erro ao salvar artefato:', err, artefato);
              rejectArtefato(err);
            } else {
              console.log(`✅ Artefato salvo: ${artefato.nome}`);
              resolveArtefato();
            }
          }
        );
      });
    });

    Promise.all(artefatoPromises)
      .then(resolve)
      .catch(reject);
  });
}

app.delete('/api/projetos/:id', requireAuth, (req, res) => {
  const projetoId = req.params.id;
  
  db.get(
    "SELECT * FROM projetos_arqueologicos WHERE id = ? AND usuario_id = ?",
    [projetoId, req.session.userId],
    (err, projeto) => {
      if (err) {
        console.error('Erro ao verificar projeto:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
      
      if (!projeto) {
        return res.status(404).json({ error: 'Projeto não encontrado' });
      }
      
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

// ========== ROTAS DE PÁGINAS ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "front", "landPage.html"));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'dashboard.html'));
});

app.get('/editor/:projetoId', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'editor.html'));
});

app.get('/sobre', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'sobre.html'));
});

app.get('/go_entrar', redirectIfLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'entrar.html'));
});

app.get('/go_login2', redirectIfLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'login2.html'));
});

app.get('/entrar.html', redirectIfLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'entrar.html'));
});

app.get('/login2.html', redirectIfLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'login2.html'));
});

// Rota para arquivos estáticos
app.get('/nav', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'nav.html'));
});

// ========== ROTAS DE EMAIL (OPCIONAIS) ==========
app.post('/enviarC', (req, res) => {
  const { nome, email, mensagem } = req.body;
  
  if (!nome || !email || !mensagem) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  const mailOptions = {
    from: email,
    to: process.env.EMAIL_USER,
    subject: `Contato do Site - ${nome}`,
    text: `Nome: ${nome}\nEmail: ${email}\nMensagem: ${mensagem}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erro ao enviar email:', error);
      return res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
    
    res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
  });
});

app.post('/validarC', (req, res) => {
  // Simulação de validação - implemente conforme necessário
  res.json({ success: true, valid: true });
});

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    session: req.session ? 'Active' : 'None'
  });
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Rota 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  console.log(`📊 Banco de dados: meubanco.db`);
  console.log(`🔐 Modo de autenticação: Sessions`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Desligando servidor...');
  db.close((err) => {
    if (err) {
      console.error('Erro ao fechar banco:', err);
      process.exit(1);
    }
    console.log('✅ Banco fechado com sucesso');
    process.exit(0);
  });
});