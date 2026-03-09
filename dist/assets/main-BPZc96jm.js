import"./modulepreload-polyfill-B5Qt9EMX.js";const n=[{id:"fill-in-blank",title:"Fill in the Blank",description:"Drag the right word into the gap. Feel the snap, hear the click, feel the wiggle when you get it wrong.",icon:"✏️",color:"#6c63ff",tags:["Language","Science","History"],status:"coming-soon"},{id:"curve-selector",title:"Curve Selector",description:"Four curves appear on a coordinate system. One is correct. Can you read the function?",icon:"📈",color:"#f59e0b",tags:["Math"],status:"available",href:"games/curve-selector/"},{id:"ball-to-goal",title:"Ball to Goal",description:"Pick the equation whose curve routes the ball to the goal. Harder levels need multiple equations in sequence.",icon:"⚽",color:"#10b981",tags:["Math"],status:"available",href:"games/ball-to-goal/"},{id:"balancing-game",title:"Balancing Act",description:"Adjust chemical equation coefficients to balance the seesaw. Press Check to trigger a dramatic 3-second reveal animation.",icon:"⚖️",color:"#7c3aed",tags:["Chemistry","Math"],status:"available",href:"games/balancing-game/"},{id:"stack-the-order",title:"Stack the Order",description:"A moving hook delivers blocks one by one. Stack them in the right sequence or watch the tower collapse.",icon:"🏗️",color:"#f59e0b",tags:["History","Science","Logic"],status:"available",href:"games/stack-the-order/"},{id:"memory-match",title:"Memory Match",description:"Flip cards to find matching pairs. Term meets definition, cause meets effect — how few moves can you take?",icon:"🧠",color:"#06b6d4",tags:["Biology","Chemistry","History","Science"],status:"available",href:"games/memory-game/"},{id:"sorting-game",title:"Sort It Out",description:"A card flips up with a concept. Swipe it left or right to sort it into the correct category. Nail streaks for bonus flair.",icon:"↔️",color:"#8b5cf6",tags:["Biology","Chemistry","History","Science"],status:"available",href:"games/sorting-game/"},{id:"drag-and-match",title:"Drag & Match",description:"Connect pairs by dragging — terms to definitions, images to labels, causes to effects.",icon:"🔗",color:"#10b981",tags:["All Subjects"],status:"coming-soon"},{id:"multiple-choice",title:"Multiple Choice",description:"Classic Q&A with reactive animations, streak counters, and optional time pressure.",icon:"🎯",color:"#3b82f6",tags:["All Subjects"],status:"coming-soon"},{id:"timeline-sort",title:"Timeline Sort",description:"Drag historical events, reactions, or steps into the correct chronological order.",icon:"🗓️",color:"#ef4444",tags:["History","Science"],status:"coming-soon"},{id:"word-scramble",title:"Word Scramble",description:"Unscramble letters to reconstruct the correct term. Fast, frantic, and strangely satisfying.",icon:"🔤",color:"#ec4899",tags:["Language"],status:"coming-soon"},{id:"equation-builder",title:"Equation Builder",description:"Drag numbers, variables, and operators into place to construct the correct equation.",icon:"🧮",color:"#14b8a6",tags:["Math"],status:"coming-soon"},{id:"true-or-false",title:"True or False",description:"Split-second decisions with dramatic reveals, streak bonuses, and screen shake on fails.",icon:"⚡",color:"#8b5cf6",tags:["All Subjects"],status:"coming-soon"}],u=["All",...new Set(n.flatMap(t=>t.tags).filter(t=>t!=="All Subjects"))];let i="All",l="";function d(){const t=document.getElementById("filterTags");t.innerHTML=u.map(a=>`
    <button class="tag ${a===i?"active":""}" data-tag="${a}">
      ${a}
    </button>
  `).join("")}function c(t){const a=document.getElementById("gamesGrid");if(t.length===0){a.innerHTML=`
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No games match that search. Try something else.</p>
      </div>
    `;return}a.innerHTML=t.map((e,s)=>`
    <div
      class="game-card"
      style="--card-color: ${e.color}; animation-delay: ${s*.055}s"
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
  `).join("")}function r(){return n.filter(t=>{const a=i==="All"||t.tags.includes(i)||t.tags.includes("All Subjects"),e=l,s=e===""||t.title.toLowerCase().includes(e)||t.description.toLowerCase().includes(e)||t.tags.some(o=>o.toLowerCase().includes(e));return a&&s})}document.getElementById("filterTags").addEventListener("click",t=>{const a=t.target.closest("[data-tag]");a&&(i=a.dataset.tag,d(),c(r()))});document.getElementById("searchBar").addEventListener("input",t=>{l=t.target.value.toLowerCase().trim(),c(r())});d();c(r());
