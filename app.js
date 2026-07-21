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

/* ---------- safe storage (falls back to in-memory when localStorage is blocked) ---------- */

var memStore = {};

function storeGet(key) {
  try { return localStorage.getItem(key); }
  catch (e) { return Object.prototype.hasOwnProperty.call(memStore, key) ? memStore[key] : null; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { memStore[key] = value; }
}
function storeDel(key) {
  try { localStorage.removeItem(key); } catch (e) { delete memStore[key]; }
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
    // reshuffle, but never let the new deck open with the tip we just showed
    var last = deck.order[deck.order.length - 1];
    var order = shuffledIndexes(poolSize);
    if (poolSize > 1 && order[0] === last) {
      var swap = 1 + Math.floor(Math.random() * (poolSize - 1));
      var tmp = order[0]; order[0] = order[swap]; order[swap] = tmp;
    }
    deck = { order: order, next: 0 };
  }
  var index = deck.order[deck.next];
  deck.next += 1;
  storeSet(storageKey, JSON.stringify(deck));
  return index;
}

function prettyCategory(cat) {
  return String(cat || '').replace(/-/g, ' ');
}

function initTipPage(pool, storageKey) {
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

  // day index in the member's own timezone, so tips rotate at their midnight, not 10am
  var now = new Date();
  var dayIndex = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / (24 * 60 * 60 * 1000));
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

function validSavedTags(saved) {
  if (!Array.isArray(saved) || saved.length !== QUIZ.questions.length) return false;
  for (var i = 0; i < QUIZ.questions.length; i++) {
    var tag = saved[i];
    var ok = QUIZ.questions[i].options.some(function (o) { return o.tag === tag; });
    if (!ok) return false;
  }
  return true;
}

function initQuiz() {
  var area = document.getElementById('quiz-area');
  if (!area || typeof QUIZ === 'undefined' || !QUIZ.questions) return;

  var saved = null;
  var raw = storeGet(QUIZ_STORE_KEY);
  if (raw) {
    try { saved = JSON.parse(raw); } catch (e) { saved = null; }
  }
  if (validSavedTags(saved)) {
    renderQuizResult(area, saved);
  } else {
    storeDel(QUIZ_STORE_KEY); // stale answers from an older version of the quiz
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
