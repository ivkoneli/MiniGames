import"./modulepreload-polyfill-B5Qt9EMX.js";const n=[{id:"curve-selector",title:"Curve Selector",description:"Four curves appear on a coordinate system. One is correct. Can you read the function?",icon:"📈",color:"#f59e0b",tags:["Math"],status:"available",href:"games/curve-selector/"},{id:"ball-to-goal",title:"Ball to Goal",description:"Pick the equation whose curve routes the ball to the goal. Harder levels need multiple equations in sequence.",icon:"⚽",color:"#10b981",tags:["Math"],status:"available",href:"games/ball-to-goal/"},{id:"balancing-game",title:"Balancing Act",description:"Adjust chemical equation coefficients to balance the seesaw. Press Check to trigger a dramatic 3-second reveal animation.",icon:"⚖️",color:"#7c3aed",tags:["Chemistry","Math"],status:"available",href:"games/balancing-game/"},{id:"stack-the-order",title:"Stack the Order",description:"A moving hook delivers blocks one by one. Stack them in the right sequence or watch the tower collapse.",icon:"🏗️",color:"#f59e0b",tags:["History","Science","Logic"],status:"available",href:"games/stack-the-order/"},{id:"memory-match",title:"Memory Match",description:"Flip cards to find matching pairs. Term meets definition, cause meets effect — how few moves can you take?",icon:"🧠",color:"#06b6d4",tags:["Biology","Chemistry","History","Science"],status:"available",href:"games/memory-game/"},{id:"sorting-game",title:"Sort It Out",description:"A card flips up with a concept. Swipe it left or right to sort it into the correct category. Nail streaks for bonus flair.",icon:"↔️",color:"#8b5cf6",tags:["Biology","Chemistry","History","Science"],status:"available",href:"games/sorting-game/"}],m=["All",...new Set(n.flatMap(t=>t.tags).filter(t=>t!=="All Subjects"))];let s="All",r="";function d(){const t=document.getElementById("filterTags");t.innerHTML=m.map(a=>`
    <button class="tag ${a===s?"active":""}" data-tag="${a}">
      ${a}
    </button>
  `).join("")}function c(t){const a=document.getElementById("gamesGrid");if(t.length===0){a.innerHTML=`
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No games match that search. Try something else.</p>
      </div>
    `;return}a.innerHTML=t.map((e,i)=>`
    <div
      class="game-card"
      style="--card-color: ${e.color}; animation-delay: ${i*.055}s"
      data-id="${e.id}"
      role="article"
    >
      <div class="card-accent"></div>
      <div class="card-body">
        <span class="card-icon" aria-hidden="true">${e.icon}</span>
        <h3 class="card-title">${e.title}</h3>
        <p class="card-description">${e.description}</p>
        <div class="card-tags">
          ${e.tags.map(o=>`<span class="card-tag">${o}</span>`).join("")}
        </div>
        <div class="card-footer">
          <span class="card-status ${e.status==="available"?"available":""}">
            ${e.status==="available"?"Available":"Coming soon"}
          </span>
          ${e.status==="available"&&e.href?`<a href="${e.href}" class="play-btn" aria-label="Play ${e.title}">Play <span class="arrow">→</span></a>`:`<button class="play-btn disabled" disabled aria-label="Play ${e.title}">Play <span class="arrow">→</span></button>`}
        </div>
      </div>
    </div>
  `).join("")}function l(){return n.filter(t=>{const a=s==="All"||t.tags.includes(s)||t.tags.includes("All Subjects"),e=r,i=e===""||t.title.toLowerCase().includes(e)||t.description.toLowerCase().includes(e)||t.tags.some(o=>o.toLowerCase().includes(e));return a&&i})}document.getElementById("filterTags").addEventListener("click",t=>{const a=t.target.closest("[data-tag]");a&&(s=a.dataset.tag,d(),c(l()))});document.getElementById("searchBar").addEventListener("input",t=>{r=t.target.value.toLowerCase().trim(),c(l())});d();c(l());const u="mg-theme";function h(t){t==="light"?document.documentElement.setAttribute("data-theme","light"):document.documentElement.removeAttribute("data-theme");const a=document.getElementById("themeIcon");a&&(a.textContent=t==="light"?"☾":"☀")}h(localStorage.getItem(u)??"dark");document.getElementById("themeToggle").addEventListener("click",()=>{const t=document.documentElement.hasAttribute("data-theme")?"dark":"light";h(t),localStorage.setItem(u,t)});
