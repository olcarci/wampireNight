const engine = new SlotEngine(GAME_CONFIG);
const $ = s => document.querySelector(s);

const reels = $('#reels');
const message = $('#message');
const betButtons = $('#betButtons');

let spinning = false;
let turbo = false;
let auto = false;

const fmt = n => Number(n).toLocaleString('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function vibrate(ms = 40) {
  if ($('#vibrationToggle')?.checked && navigator.vibrate) navigator.vibrate(ms);
}

function randomSymbol() {
  return GAME_CONFIG.symbols[Math.floor(Math.random() * GAME_CONFIG.symbols.length)];
}

function renderReels(grid) {
  reels.innerHTML = '';

  for (let r = 0; r < GAME_CONFIG.rows; r++) {
    for (let c = 0; c < GAME_CONFIG.cols; c++) {
      const sym = grid ? grid[r][c] : engine.pick();
      const cell = document.createElement('div');

      cell.className = `symbol ${sym.id}`;
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.innerHTML = `<span>${sym.label}</span>`;

      reels.appendChild(cell);
    }
  }
}

function renderBets() {
  betButtons.innerHTML = '';

  GAME_CONFIG.bets.forEach(b => {
    const btn = document.createElement('button');
    btn.textContent = b;
    btn.className = b === engine.bet ? 'active' : '';

    btn.onclick = () => {
      engine.setBet(b);
      renderBets();
      message.textContent = `${b} TRY bahis seçildi`;
      vibrate(20);
    };

    betButtons.appendChild(btn);
  });
}

function updateMeters() {
  balance.textContent = fmt(engine.balance);
  lastWin.textContent = fmt(engine.lastWin);

  for (const k of Object.keys(engine.jackpots)) {
    document.getElementById(k).textContent = fmt(engine.jackpots[k]);
  }
}

function clearWinEffects() {
  paylineLayer.innerHTML = '';
  document.querySelectorAll('.symbol').forEach(el => {
    el.classList.remove('win-cell', 'spin-blur', 'land');
  });
}

function drawLine(idx) {
  const line = GAME_CONFIG.lines[idx];

  const pts = line
    .map((row, col) => `${(col + .5) * 20},${(row + .5) * 33.333}`)
    .join(' ');

  const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  pl.setAttribute('points', pts);
  pl.setAttribute('class', 'payline');
  paylineLayer.appendChild(pl);
}

function showWins(winLines) {
  clearWinEffects();

  winLines.forEach(w => {
    drawLine(w.idx);

    GAME_CONFIG.lines[w.idx].forEach((row, col) => {
      const cell = document.querySelector(`.symbol[data-row="${row}"][data-col="${col}"]`);
      if (cell) cell.classList.add('win-cell');
    });
  });
}

function bigWin(amount) {
  if (!$('#bigWinToggle').checked) return;

  bigWinAmount.textContent = fmt(amount);
  bigWin.classList.remove('hidden');
  Sound.big();

  setTimeout(() => bigWin.classList.add('hidden'), 1800);
}

function setCell(row, col, sym, effect = false) {
  const cell = document.querySelector(`.symbol[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;

  cell.className = `symbol ${sym.id}`;
  cell.dataset.row = row;
  cell.dataset.col = col;
  cell.innerHTML = `<span>${sym.label}</span>`;

  if (effect) {
    cell.classList.add('land');
    setTimeout(() => cell.classList.remove('land'), 350);
  }
}

function animateReelsToResult(finalGrid) {
  return new Promise(resolve => {
    const cols = GAME_CONFIG.cols;
    const rows = GAME_CONFIG.rows;
    let stopped = 0;

    for (let c = 0; c < cols; c++) {
      const columnCells = [...document.querySelectorAll(`.symbol[data-col="${c}"]`)];

      columnCells.forEach(cell => cell.classList.add('spin-blur'));

      const interval = setInterval(() => {
        for (let r = 0; r < rows; r++) {
          setCell(r, c, randomSymbol());
          const cell = document.querySelector(`.symbol[data-row="${r}"][data-col="${c}"]`);
          if (cell) cell.classList.add('spin-blur');
        }
      }, turbo ? 45 : 70);

      const stopTime = (turbo ? 350 : 700) + c * (turbo ? 120 : 280);

      setTimeout(() => {
        clearInterval(interval);

        for (let r = 0; r < rows; r++) {
          setCell(r, c, finalGrid[r][c], true);
        }

        const newColumnCells = [...document.querySelectorAll(`.symbol[data-col="${c}"]`)];
        newColumnCells.forEach(cell => {
          cell.classList.remove('spin-blur');
          cell.classList.add('reel-stop');
          setTimeout(() => cell.classList.remove('reel-stop'), 300);
        });

        Sound.stop();
        vibrate(25);

        stopped++;

        if (stopped === cols) {
          setTimeout(resolve, 250);
        }
      }, stopTime);
    }
  });
}

async function spin() {
  if (spinning) return;

  spinning = true;
  spinBtn.disabled = true;
  clearWinEffects();

  message.textContent = engine.freeSpins > 0
    ? `Ücretsiz spin... Kalan ${engine.freeSpins}`
    : 'Makaralar dönüyor...';

  Sound.spin();
  vibrate(35);

  const result = engine.spin();

  if (result.error) {
    message.textContent = result.error;
    spinning = false;
    spinBtn.disabled = false;
    return;
  }

  await animateReelsToResult(result.grid);

  updateMeters();
  showWins(result.winLines);

  if (result.jackpot) {
    message.textContent = `${result.jackpot.key.toUpperCase()} JACKPOT! ${fmt(result.jackpot.amount)} TRY`;
    Sound.bonus();
    bigWin(result.win);
  } else if (result.bonus) {
    openBonus(result.bonus.bellCount, result.bonus.bonusWin);
  } else if (result.freeTrigger) {
    freeBanner.classList.remove('hidden');
    message.textContent = `5 FREE SPIN kazandın! Kalan: ${result.freeSpins}`;
    Sound.bonus();
    setTimeout(() => freeBanner.classList.add('hidden'), 1500);
  } else if (result.win > 0) {
    message.textContent = `Kazanç: ${fmt(result.win)} TRY`;

    if (result.win >= engine.bet * 15) {
      bigWin(result.win);
    } else {
      Sound.win();
    }
  } else {
    message.textContent = 'Kazanamadın, tekrar dene';
  }

  spinning = false;
  spinBtn.disabled = false;

  if (auto && engine.balance >= engine.bet) {
    setTimeout(spin, 650);
  }
}

function openBonus(count, win) {
  bonusText.textContent = `${count} adet çan geldi. Bonus kazancı: ${fmt(win)} TRY`;
  bonusScreen.classList.remove('hidden');
  Sound.bonus();
  vibrate(80);
}

function renderPaytable() {
  payList.innerHTML = GAME_CONFIG.symbols.map(s =>
    `<div class="pay-row">
      <span>${s.label} ${s.name}</span>
      <b>3x ${s.pay[3]} • 4x ${s.pay[4]} • 5x ${s.pay[5]}</b>
    </div>`
  ).join('');
}

function renderHistory() {
  historyList.innerHTML = engine.history.length
    ? engine.history.map(h =>
      `<div class="hist-row">
        <span>${h.time}</span>
        <b>Bahis ${h.bet}</b>
        <strong>${fmt(h.win)}</strong>
        <em>${h.jackpot || h.bonus ? 'BONUS' : ''}</em>
      </div>`
    ).join('')
    : '<p>Henüz oyun yok.</p>';
}

bonusCollect.onclick = () => bonusScreen.classList.add('hidden');

spinBtn.onclick = spin;

turboBtn.onclick = () => {
  turbo = !turbo;
  turboBtn.classList.toggle('active', turbo);
  message.textContent = turbo ? 'Hızlı spin açık' : 'Hızlı spin kapalı';
};

autoBtn.onclick = () => {
  auto = !auto;
  autoBtn.classList.toggle('active', auto);
  message.textContent = auto ? 'Otomatik oyun açık' : 'Otomatik oyun kapalı';
  if (auto) spin();
};

soundBtn.onclick = () => {
  const on = Sound.toggle();
  soundBtn.textContent = on ? 'SES' : 'SESSİZ';
};

paytableBtn.onclick = () => {
  renderPaytable();
  paytable.showModal();
};

settingsBtn.onclick = () => settings.showModal();

historyBtn.onclick = () => {
  renderHistory();
  history.showModal();
};

resetBtn.onclick = () => {
  engine.reset();
  renderBets();
  updateMeters();
  message.textContent = 'Bakiye sıfırlandı';
  settings.close();
};

document.querySelectorAll('[data-close]').forEach(b => {
  b.onclick = () => document.getElementById(b.dataset.close).close();
});

fullscreenBtn.onclick = () => {
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen?.();
};

renderReels();
renderBets();
updateMeters();
