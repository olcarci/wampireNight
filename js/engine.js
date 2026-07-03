class SlotEngine {
  constructor(config) {
    this.config = config;

    const saved = Store.load();

    this.balance = saved.balance ?? 1000;
    this.bet = saved.bet ?? config.defaultBet;
    this.lastWin = 0;
    this.freeSpins = saved.freeSpins ?? 0;
    this.history = saved.history ?? [];

    this.jackpots = saved.jackpots ?? {
      grand: 94837.83,
      major: 116351.52,
      minor: 5001.40,
      mini: 1000.70
    };
  }

  save() {
    Store.save({
      balance: this.balance,
      bet: this.bet,
      freeSpins: this.freeSpins,
      history: this.history,
      jackpots: this.jackpots
    });
  }

  reset() {
    this.balance = 1000;
    this.bet = this.config.defaultBet;
    this.lastWin = 0;
    this.freeSpins = 0;
    this.history = [];
    this.jackpots = {
      grand: 94837.83,
      major: 116351.52,
      minor: 5001.40,
      mini: 1000.70
    };
    this.save();
  }

  setBet(value) {
    this.bet = value;
    this.save();
  }

  random(min, max) {
    return Math.random() * (max - min) + min;
  }

  pick() {
    const total = this.config.symbols.reduce((sum, s) => sum + s.weight, 0);
    let roll = Math.random() * total;

    for (const sym of this.config.symbols) {
      roll -= sym.weight;
      if (roll <= 0) return sym;
    }

    return this.config.symbols[0];
  }

  createGrid() {
    const grid = [];

    for (let r = 0; r < this.config.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < this.config.cols; c++) {
        grid[r][c] = this.pick();
      }
    }

    return grid;
  }

  countBells(grid) {
    let count = 0;

    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        if (grid[r][c].id === 'bell') count++;
      }
    }

    return count;
  }

  calculateLineWins(grid) {
    let totalWin = 0;
    const winLines = [];

    this.config.lines.forEach((line, idx) => {
      const symbols = line.map((row, col) => grid[row][col]);
      const first = symbols[0];

      let count = 1;

      for (let i = 1; i < symbols.length; i++) {
        if (symbols[i].id === first.id) {
          count++;
        } else {
          break;
        }
      }

      if (count >= 3 && first.pay[count]) {
        const win = first.pay[count] * this.bet;
        totalWin += win;

        winLines.push({
          idx,
          symbol: first.id,
          count,
          win
        });
      }
    });

    return { totalWin, winLines };
  }

  checkFreeSpin(grid) {
    let batCount = 0;

    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        if (grid[r][c].id === 'bat') batCount++;
      }
    }

    return batCount >= 3;
  }

  checkBonus(grid) {
    const bellCount = this.countBells(grid);

    if (bellCount >= 6) {
      const bonusWin = this.bet * bellCount * this.random(4, 10);

      return {
        bellCount,
        bonusWin: Math.round(bonusWin * 100) / 100
      };
    }

    return null;
  }

  checkJackpot(grid) {
    const bellCount = this.countBells(grid);

    if (bellCount < 8) return null;

    let key = 'mini';

    if (bellCount >= 14) key = 'grand';
    else if (bellCount >= 11) key = 'major';
    else if (bellCount >= 9) key = 'minor';

    const amount = this.jackpots[key];

    this.jackpots[key] = Math.round((this.jackpots[key] * 0.75) * 100) / 100;

    return { key, amount };
  }

  growJackpots() {
    this.jackpots.grand += this.bet * 0.02;
    this.jackpots.major += this.bet * 0.015;
    this.jackpots.minor += this.bet * 0.01;
    this.jackpots.mini += this.bet * 0.005;
  }

  addHistory(win, extra = {}) {
    this.history.unshift({
      time: new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      bet: this.bet,
      win,
      ...extra
    });

    this.history = this.history.slice(0, 20);
  }

  spin() {
    if (this.freeSpins > 0) {
      this.freeSpins--;
    } else {
      if (this.balance < this.bet) {
        return { error: 'Yetersiz bakiye' };
      }

      this.balance -= this.bet;
    }

    this.growJackpots();

    const grid = this.createGrid();

    const lineResult = this.calculateLineWins(grid);
    let win = lineResult.totalWin;

    const jackpot = this.checkJackpot(grid);

    if (jackpot) {
      win += jackpot.amount;
    }

    const bonus = this.checkBonus(grid);

    if (bonus) {
      win += bonus.bonusWin;
    }

    let freeTrigger = false;

    if (this.checkFreeSpin(grid)) {
      this.freeSpins += 5;
      freeTrigger = true;
    }

    this.balance += win;
    this.lastWin = win;

    this.addHistory(win, {
      jackpot: jackpot ? jackpot.key : '',
      bonus: bonus ? true : false
    });

    this.save();

    return {
      grid,
      win,
      winLines: lineResult.winLines,
      jackpot,
      bonus,
      freeTrigger,
      freeSpins: this.freeSpins
    };
  }
}
