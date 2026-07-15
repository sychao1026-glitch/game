const boardEl = document.querySelector("#board");
const statusText = document.querySelector("#statusText");
const mineCountEl = document.querySelector("#mineCount");
const timerEl = document.querySelector("#timer");
const moveCountEl = document.querySelector("#moveCount");
const newGameBtn = document.querySelector("#newGameBtn");
const difficultyButtons = document.querySelectorAll("[data-level]");

const LEVELS = {
  easy: { label: "初級", rows: 9, cols: 9, mines: 10 },
  medium: { label: "中級", rows: 16, cols: 16, mines: 40 },
  hard: { label: "高級", rows: 16, cols: 30, mines: 99 },
};

const NUMBER_CLASS = ["", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];

const state = {
  levelKey: "easy",
  rows: 9,
  cols: 9,
  mines: 10,
  cells: [],
  started: false,
  finished: false,
  flags: 0,
  revealed: 0,
  moves: 0,
  seconds: 0,
  timerId: null,
  longPressId: null,
  selectedIndex: 0,
};

function resetGame(levelKey = state.levelKey) {
  const level = LEVELS[levelKey];
  stopTimer();
  Object.assign(state, {
    levelKey,
    rows: level.rows,
    cols: level.cols,
    mines: level.mines,
    cells: makeCells(level.rows, level.cols),
    started: false,
    finished: false,
    flags: 0,
    revealed: 0,
    moves: 0,
    seconds: 0,
    timerId: null,
    longPressId: null,
    selectedIndex: 0,
  });

  boardEl.style.setProperty("--size", String(level.cols));
  boardEl.innerHTML = "";
  renderBoard();
  setSelectedCell(state.cells[0]);
  syncDifficultyButtons();
  updateStats();
  statusText.textContent = `${level.label}：先翻一格開始，第一步不會踩雷。`;
}

function makeCells(rows, cols) {
  return Array.from({ length: rows * cols }, (_, index) => ({
    index,
    row: Math.floor(index / cols),
    col: index % cols,
    mine: false,
    adjacent: 0,
    open: false,
    flagged: false,
    el: null,
  }));
}

function renderBoard() {
  const fragment = document.createDocumentFragment();
  state.cells.forEach((cell) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `第 ${cell.row + 1} 列第 ${cell.col + 1} 欄，未翻開`);
    button.dataset.index = String(cell.index);
    button.addEventListener("click", handleReveal);
    button.addEventListener("contextmenu", handleFlag);
    button.addEventListener("keydown", handleCellKeydown);
    button.addEventListener("focus", () => setSelectedCell(cell));
    button.addEventListener("pointerenter", () => setSelectedCell(cell));
    button.addEventListener("pointerdown", startLongPress);
    button.addEventListener("pointerup", cancelLongPress);
    button.addEventListener("pointerleave", cancelLongPress);
    button.addEventListener("pointercancel", cancelLongPress);
    cell.el = button;
    fragment.append(button);
  });
  boardEl.append(fragment);
}

function handleReveal(event) {
  const cell = getCellFromEvent(event);
  setSelectedCell(cell);
  revealCell(cell);
}

function handleFlag(event) {
  event.preventDefault();
  const cell = getCellFromEvent(event);
  setSelectedCell(cell);
  toggleFlag(cell);
}

function handleCellKeydown(event) {
  const cell = getCellFromEvent(event);
  if (event.key === "Enter") {
    event.preventDefault();
    setSelectedCell(cell);
    revealCell(cell);
  }
  if (event.key === " ") {
    event.preventDefault();
    setSelectedCell(cell);
    toggleFlag(cell);
  }
  if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
    event.preventDefault();
    moveSelection(event.key, cell);
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== " " || event.target.closest?.("button")) return;
  event.preventDefault();
  toggleFlag(state.cells[state.selectedIndex]);
}

function setSelectedCell(cell) {
  const previous = state.cells[state.selectedIndex];
  if (previous) previous.el.classList.remove("selected");
  state.selectedIndex = cell.index;
  cell.el.classList.add("selected");
}

function moveSelection(key, cell) {
  const moves = {
    ArrowUp: -state.cols,
    ArrowRight: 1,
    ArrowDown: state.cols,
    ArrowLeft: -1,
  };
  const nextIndex = cell.index + moves[key];
  const next = state.cells[nextIndex];
  if (!next) return;
  if (key === "ArrowLeft" && next.row !== cell.row) return;
  if (key === "ArrowRight" && next.row !== cell.row) return;
  setSelectedCell(next);
  next.el.focus({ preventScroll: true });
}

function startLongPress(event) {
  if (event.pointerType === "mouse") return;
  const cell = getCellFromEvent(event);
  state.longPressId = window.setTimeout(() => {
    toggleFlag(cell);
    state.longPressId = null;
  }, 420);
}

function cancelLongPress() {
  if (state.longPressId) {
    window.clearTimeout(state.longPressId);
    state.longPressId = null;
  }
}

function getCellFromEvent(event) {
  return state.cells[Number(event.currentTarget.dataset.index)];
}

function revealCell(cell) {
  if (state.finished || cell.open || cell.flagged) return;

  if (!state.started) {
    placeMines(cell);
    startTimer();
    state.started = true;
  }

  state.moves += 1;

  if (cell.mine) {
    openMine(cell);
    finishGame(false);
    return;
  }

  floodOpen(cell);
  updateStats();
  checkWin();
}

function toggleFlag(cell) {
  if (state.finished || cell.open) return;
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  paintCell(cell);
  updateStats();
}

function placeMines(firstCell) {
  const safe = new Set([firstCell.index, ...neighborsOf(firstCell).map((cell) => cell.index)]);
  const candidates = state.cells.filter((cell) => !safe.has(cell.index));
  shuffle(candidates);

  candidates.slice(0, state.mines).forEach((cell) => {
    cell.mine = true;
  });

  state.cells.forEach((cell) => {
    cell.adjacent = neighborsOf(cell).filter((neighbor) => neighbor.mine).length;
  });
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function neighborsOf(cell) {
  const neighbors = [];
  for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
    for (let col = cell.col - 1; col <= cell.col + 1; col += 1) {
      if (row === cell.row && col === cell.col) continue;
      if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) continue;
      neighbors.push(state.cells[row * state.cols + col]);
    }
  }
  return neighbors;
}

function floodOpen(startCell) {
  const queue = [startCell];
  const visited = new Set();

  while (queue.length) {
    const cell = queue.shift();
    if (visited.has(cell.index) || cell.open || cell.flagged) continue;
    visited.add(cell.index);
    openSafeCell(cell);

    if (cell.adjacent === 0) {
      neighborsOf(cell).forEach((neighbor) => {
        if (!neighbor.open && !neighbor.mine) queue.push(neighbor);
      });
    }
  }
}

function openSafeCell(cell) {
  cell.open = true;
  state.revealed += 1;
  paintCell(cell);
}

function openMine(hitCell) {
  hitCell.open = true;
  state.cells.forEach((cell) => {
    if (cell.mine) {
      cell.open = true;
      paintCell(cell, cell === hitCell ? "hit" : "mine");
    }
  });
}

function paintCell(cell, mineState = "") {
  const { el } = cell;
  el.className = "cell";
  el.textContent = "";

  if (cell.open) {
    el.classList.add("open");
    el.disabled = true;

    if (cell.mine) {
      el.textContent = "✹";
      el.classList.add(mineState === "hit" ? "mine-hit" : "mine-safe");
      el.setAttribute("aria-label", `第 ${cell.row + 1} 列第 ${cell.col + 1} 欄，地雷`);
      return;
    }

    if (cell.adjacent > 0) {
      el.textContent = String(cell.adjacent);
      el.classList.add(NUMBER_CLASS[cell.adjacent]);
      el.setAttribute("aria-label", `第 ${cell.row + 1} 列第 ${cell.col + 1} 欄，周圍 ${cell.adjacent} 顆地雷`);
    } else {
      el.setAttribute("aria-label", `第 ${cell.row + 1} 列第 ${cell.col + 1} 欄，空白`);
    }
    return;
  }

  if (cell.flagged) {
    el.textContent = "⚑";
    el.classList.add("flagged");
    el.setAttribute("aria-label", `第 ${cell.row + 1} 列第 ${cell.col + 1} 欄，已插旗`);
  } else {
    el.setAttribute("aria-label", `第 ${cell.row + 1} 列第 ${cell.col + 1} 欄，未翻開`);
  }
}

function checkWin() {
  if (state.revealed !== state.rows * state.cols - state.mines) return;
  state.cells.forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      paintCell(cell);
    }
  });
  state.flags = state.mines;
  finishGame(true);
}

function finishGame(won) {
  state.finished = true;
  stopTimer();
  state.cells.forEach((cell) => {
    cell.el.disabled = true;
  });
  updateStats();
  statusText.textContent = won ? "完成！所有安全格都翻開了。" : "踩到地雷，下一局小心一點。";
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    state.seconds = Math.min(999, state.seconds + 1);
    updateStats();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateStats() {
  mineCountEl.textContent = String(Math.max(0, state.mines - state.flags));
  timerEl.textContent = String(state.seconds).padStart(3, "0");
  moveCountEl.textContent = state.moves.toLocaleString("zh-Hant");
}

function syncDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.level === state.levelKey);
  });
}

newGameBtn.addEventListener("click", () => resetGame());

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => resetGame(button.dataset.level));
});

resetGame();
document.addEventListener("keydown", handleGlobalKeydown);
