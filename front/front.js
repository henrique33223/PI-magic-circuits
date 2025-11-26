fetch('/nav.html')
.then(res => res.text())
.then(html => {
  document.querySelector('#nav_container').innerHTML = html;
})