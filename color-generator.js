const containerEl=document.querySelector('.container');
for (let index = 0; index < 30 ; index++) {
    const colorContainerEl=document.createElement("div");
    colorContainerEl.classList.add("color-container");
    containerEl.appendChild(colorContainerEl);
  
}

const colorContainerEls=document.querySelectorAll('.color-container');

generateColors();

function generateColors(){
   colorContainerEls.forEach((colorContainerEl) =>{
         const newColorCode= randomColor();
         colorContainerEl.style.backgroundColor= '#'+ newColorCode;
         colorContainerEl.innerHTML="#" + newColorCode;
   });
}

function randomColor(){
  const chars="123456789adcdef";
  const colorCodeLength=6;
  let colorCode="";
  for (let index = 0; index < colorCodeLength; index++) {
    const randomNum=Math.floor(Math.random()*chars.length);
    colorCode += chars.substring(randomNum,randomNum+1);  
  }
  return colorCode;
}