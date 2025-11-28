// Seu frontend atual (login1.html, login2.html)
fetch('/nav.html')
.then(res => {
    if (!res.ok) throw new Error('Erro ao carregar navegação');
    return res.text();
})
.then(html => {
    const navContainer = document.querySelector('#nav_container');
    if (navContainer) {
        navContainer.innerHTML = html;
    }
})
.catch(error => console.error('Erro ao carregar nav:', error));

let emailSalvo = '';
let codigoSalvo = '';

async function salvarInfo(){
    try {
        const nome = document.querySelector('#log1_name').value;
        emailSalvo = document.querySelector('#log1_email').value;
        const password = document.querySelector('#log1_pass').value;
        
        const response = await fetch('/salvarData', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome, email: emailSalvo, password})
        });
        
        if(response.ok){
            console.log('Dados salvos com sucesso')
            const emailRes = await fetch('/enviarC', {
                method: 'POST',
                headers: {'Content-type': 'application/json'},
                body: JSON.stringify({ emailDestino: emailSalvo })
            });
            
            if (emailRes.ok) {
                console.log('email enviado com sucesso!');
                const respJson = await emailRes.json();
                codigoSalvo = respJson.codigo;
                
                localStorage.setItem('emailVerificacao', emailSalvo);
                localStorage.setItem('codigoEnviado', codigoSalvo);
                
                window.location.href = '/go_login2';
                
            } else {
                console.log('erro ao enviar email/codigo');
            }
        } else {
            console.error('Erro ao salvar os dados');
        }
    } catch (error) {
        console.error('Erro na função salvarInfo:', error);
    }
}

async function validarC(){
    try {
        const inputs = document.querySelectorAll('.c_input');
        let codigoDigitado = '';
        
        inputs.forEach((input) => {
            codigoDigitado += input.value;
        });

        const email = localStorage.getItem('emailVerificacao');
        const codigoEnviado = localStorage.getItem('codigoEnviado');

        if (!email || !codigoEnviado) {
            alert('Dados de verificação não encontrados. Volte para a página anterior.');
            return;
        }

        const response = await fetch('/validarC', {
            method: 'POST',
            headers: {'Content-type': 'application/json'},
            body: JSON.stringify({
                emailDestino: email, 
                codigoEnviado: codigoDigitado
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log('Código validado com sucesso!');
            localStorage.removeItem('emailVerificacao');
            localStorage.removeItem('codigoEnviado');
            window.location.href = '/go_entrar'; // ← AQUI ESTÁ O "PROBLEMA"
        } else {
            alert(result.message || 'Código inválido');
            inputs.forEach(input => input.value = '');
            inputs[0].focus();
        }

    } catch (error) {
        console.error('Erro ao validar código:', error);
        alert('Erro ao validar código');
    }
}

async function entrar(){
  try {
    const email = document.querySelector('#ent_email').value;
    const pass = document.querySelector('#ent_pass').value;

    if (!email || !pass) {
      alert('Por favor, preencha email e senha');
      return;
    }

    const response = await fetch('/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: email, password: pass})
    });

    // Pega a resposta como TEXTO primeiro
    const textResponse = await response.text();
    console.log('Resposta do servidor:', textResponse);

    // Verifica se a resposta indica sucesso
    if (response.ok) {
      // Se a resposta contém "sucesso" ou similar, redireciona
      if (textResponse.toLowerCase().includes('sucesso') || 
          textResponse.toLowerCase().includes('login realizado')) {
        console.log('Login realizado com sucesso - redirecionando');
        window.location.href = '/dashboard';
      } else {
        // Tenta parsear como JSON (caso misturado)
        try {
          const result = JSON.parse(textResponse);
          if (result.success) {
            window.location.href = '/dashboard';
          } else {
            alert(result.message || textResponse);
          }
        } catch {
          // Se não for JSON, usa o texto da resposta
          alert(textResponse);
        }
      }
    } else {
      // Se a resposta não é OK (status 4xx, 5xx)
      alert(`Erro ${response.status}: ${textResponse}`);
    }

  } catch (error) {
    console.error('Erro no login:', error);
    alert('Erro de conexão. Tente novamente.');
  }
}