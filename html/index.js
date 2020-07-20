$(document).ready(async () => {
    new Function(['particlesJS'], await (await fetch('https://raw.githubusercontent.com/DeltaUser/background/master/index.js')).text())(particlesJS);
});