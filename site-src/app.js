(function () {
  "use strict";

  // --- Theme (runs on every page) ---
  var root = document.documentElement;

  function applyStoredTheme() {
    var stored = null;
    try {
      stored = localStorage.getItem("theme");
    } catch (e) {
      stored = null;
    }
    if (stored === "dark" || stored === "light") {
      root.dataset.theme = stored;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.dataset.theme = "dark";
    } else {
      root.dataset.theme = "light";
    }
  }

  applyStoredTheme();

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
    });
  }

  // --- Search + filter (only when #results exists) ---
  var results = document.getElementById("results");
  if (!results) {
    return;
  }

  var cards = [].slice.call(document.querySelectorAll(".card"));
  var searchInput = document.getElementById("search");
  var filters = document.getElementById("filters");
  var countEl = document.getElementById("count");
  var emptyEl = document.getElementById("empty");

  var activeCategory = "";
  var query = "";

  function apply() {
    var visible = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var cats = (card.dataset.categories || "").split(" ");
      var matchCat = !activeCategory || cats.indexOf(activeCategory) !== -1;
      var hay = (
        (card.dataset.title || "") + " " +
        (card.dataset.description || "") + " " +
        (card.dataset.tags || "")
      ).toLowerCase();
      var matchQ = !query || hay.indexOf(query) !== -1;
      var show = matchCat && matchQ;
      card.hidden = !show;
      if (show) {
        visible++;
      }
    }
    if (countEl) {
      countEl.textContent = visible + " guides";
    }
    if (emptyEl) {
      emptyEl.hidden = visible > 0;
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      query = searchInput.value.trim().toLowerCase();
      apply();
    });
  }

  if (filters) {
    filters.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest(".chip") : null;
      if (!chip || !filters.contains(chip)) {
        return;
      }
      activeCategory = chip.dataset.category || "";
      var allChips = filters.querySelectorAll(".chip");
      for (var i = 0; i < allChips.length; i++) {
        allChips[i].classList.remove("active");
      }
      chip.classList.add("active");
      apply();
    });
  }

  apply();
})();
