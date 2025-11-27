fetch('/nav.html')
.then(res => res.text())
.then(html => {
  document.querySelector('#nav_container').innerHTML = html;
})
async function salvarInfo(){
  const nome = document.querySelector('#log1_name').value;
  const email = document.querySelector('#log1_email').value;
  const password = document.querySelector('#log1_pass').value;
  const response = await fetch('/salvarData', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ nome, email, password})
  });
  if(response.ok){
    console.log('Dados salvos com sucesso')
    window.location.href = '/go_login2';
  }else {
    console.error('Erro ao salvar os dados')
  }

}