let chamou = false;
const scr = ['landPage', 'login1', 'login2', 'posts'];
if(!chamou){
  for (let i = 0; i < scr.length; i++) {
    fetch(`htmls/${scr[i]}.html`)
      .then(res => res.text())
      .then(html => {
        const el = document.getElementById(scr[i]);
        if (el) {
          el.innerHTML = html;
        }
      });
  }
  

 
  chamou = true;
  
}