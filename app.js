/* Locked In · shared logic: week badge, tip decks, nutrition quiz */

/* ---------- week badge ---------- */

function renderWeekBadge() {
  var el = document.getElementById('week-badge');
  if (!el) return;
  var start = new Date(2026, 6, 20); // Mon 20 July 2026, local time
  var end = new Date(2026, 7, 31);   // day after Sun 30 Aug
  var now = new Date();
  if (now < start) {
    el.textContent = 'STARTS 20 JULY';
  } else if (now >= end) {
    el.textContent = 'CHALLENGE COMPLETE';
  } else {
    var week = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
    if (week > 6) week = 6;
    el.textContent = 'WEEK ' + week + ' OF 6';
  }
}

/* ---------- safe storage (private browsing fallback) ---------- */

function storeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* in-memory session only */ }
}
function storeDel(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

/* ---------- tip deck: shuffled order, one tip per visit, no repeats until the deck runs out ---------- */

function shuffledIndexes(n) {
  var arr = [];
  for (var i = 0; i < n; i++) arr.push(i);
  for (var j = arr.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
  }
  return arr;
}

function loadDeck(storageKey, poolSize) {
  var deck = null;
  var raw = storeGet(storageKey);
  if (raw) {
    try { deck = JSON.parse(raw); } catch (e) { deck = null; }
  }
  if (!deck || !deck.order || deck.order.length !== poolSize || typeof deck.next !== 'number' || deck.next < 0) {
    deck = { order: shuffledIndexes(poolSize), next: 0 };
  }
  return deck;
}

function drawFromDeck(storageKey, poolSize) {
  var deck = loadDeck(storageKey, poolSize);
  if (deck.next >= deck.order.length) {
    deck = { order: shuffledIndexes(poolSize), next: 0 };
  }
  var index = deck.order[deck.next];
  deck.next += 1;
  storeSet(storageKey, JSON.stringify(deck));
  return index;
}

function prettyCategory(cat) {
  return String(cat || '').replace(/-/g, ' ');
}

function initTipPage(pool, storageKey, isHeat) {
  var card = document.getElementById('tip-card');
  var textEl = document.getElementById('tip-text');
  var catEl = document.getElementById('tip-cat');
  var btn = document.getElementById('another-btn');
  if (!card || !textEl || !pool || !pool.length) return;

  function showTip() {
    var tip = pool[drawFromDeck(storageKey, pool.length)];
    textEl.textContent = tip.text;
    if (catEl) catEl.textContent = prettyCategory(tip.category);
    // retrigger the reveal animation
    card.classList.remove('reveal');
    void card.offsetWidth; // force reflow so the animation restarts
    card.classList.add('reveal');
  }

  if (btn) btn.addEventListener('click', showTip);
  showTip();
}

/* ---------- nutrition quiz ---------- */

var QUIZ_STORE_KEY = 'lockedin-quiz-tags';

function quizAdviceFor(tags) {
  var byTag = {};
  (QUIZ.advice || []).forEach(function (entry) { byTag[entry.tag] = entry.tips || []; });

  var dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  var tipVariant = dayIndex % 2;       // rotate which of the 2 tips per tag shows
  var altPick = dayIndex % 3;          // rotate which non-goal answer supplies tip two

  var goalTag = tags[3];               // q4 = the member's goal
  var others = [tags[0], tags[1], tags[2]].filter(function (t) { return byTag[t] && byTag[t].length; });
  var secondTag = others.length ? others[altPick % others.length] : null;

  var result = [];
  if (goalTag && byTag[goalTag] && byTag[goalTag].length) {
    result.push(byTag[goalTag][tipVariant % byTag[goalTag].length]);
  }
  if (secondTag) {
    result.push(byTag[secondTag][tipVariant % byTag[secondTag].length]);
  }
  // fallback: never show an empty result
  if (!result.length && QUIZ.advice && QUIZ.advice.length) {
    result.push(QUIZ.advice[0].tips[0]);
  }
  return result;
}

function initQuiz() {
  var area = document.getElementById('quiz-area');
  if (!area || typeof QUIZ === 'undefined' || !QUIZ.questions) return;

  var saved = null;
  var raw = storeGet(QUIZ_STORE_KEY);
  if (raw) {
    try { saved = JSON.parse(raw); } catch (e) { saved = null; }
  }
  if (saved && saved.length === QUIZ.questions.length) {
    renderQuizResult(area, saved);
  } else {
    renderQuizStep(area, []);
  }
}

function renderQuizStep(area, tags) {
  var qIndex = tags.length;
  var q = QUIZ.questions[qIndex];

  var progress = '<div class="quiz-progress">';
  for (var i = 0; i < QUIZ.questions.length; i++) {
    progress += '<span class="' + (i < qIndex ? 'done' : '') + '"></span>';
  }
  progress += '</div>';

  var html = progress + '<p class="quiz-q">' + q.question + '</p><div class="quiz-options">';
  q.options.forEach(function (opt, i) {
    html += '<button class="quiz-opt" type="button" data-i="' + i + '">' + opt.label + '</button>';
  });
  html += '</div>';
  area.innerHTML = html;

  area.querySelectorAll('.quiz-opt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = tags.concat([q.options[Number(btn.dataset.i)].tag]);
      if (next.length === QUIZ.questions.length) {
        storeSet(QUIZ_STORE_KEY, JSON.stringify(next));
        renderQuizResult(area, next);
      } else {
        renderQuizStep(area, next);
      }
    });
  });
}

function renderQuizResult(area, tags) {
  var tips = quizAdviceFor(tags);
  var html = '<div class="personal-tips">';
  tips.forEach(function (t) { html += '<div class="personal-tip">' + t + '</div>'; });
  html += '</div>';
  html += '<button class="btn btn-ghost quiz-redo" id="quiz-redo" type="button">Redo the quiz</button>';
  area.innerHTML = html;

  document.getElementById('quiz-redo').addEventListener('click', function () {
    storeDel(QUIZ_STORE_KEY);
    renderQuizStep(area, []);
  });
}
