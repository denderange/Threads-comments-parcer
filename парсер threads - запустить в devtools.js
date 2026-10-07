(async () => {
  const CONFIG = {
    scrollStep: 650,
    waitAfterScroll: 1800,
    maxEndChecks: 15,
    endWait: 2500,
  };

  const comments = [];
  const processedIds = new Set();
  const processedFallback = new Set();
  let postText = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function extractTextBlocks(container) {
    const spans = container.querySelectorAll('div.xat24cr > span[dir="auto"]');

    const parts = [];

    for (const span of spans) {
      const text = span.innerText.trim();

      if (!text) {
        continue;
      }

      parts.push(text);
    }

    return parts;
  }

  function isOriginalPost(container) {
    const text = container.innerText || "";
    return /^Ответьте\s.+…/m.test(text);
  }

  function extractOriginalPost(container) {
    const parts = extractTextBlocks(container);

    if (parts.length === 0) {
      return null;
    }

    const cleanedParts = [];

    for (const part of parts) {
      let text = part;

      text = text.replace(/\n+\d+\n+\/\n+\d+\s*$/, "");

      text = text.trim();

      if (!text) {
        continue;
      }

      if (text === "Популярные" || text === "Смотреть действия") {
        break;
      }

      cleanedParts.push(text);
    }

    if (cleanedParts.length === 0) {
      return null;
    }

    return cleanedParts.join("\n").trim();
  }

  function findOriginalPost() {
    const containers = document.querySelectorAll(
      '[data-pressable-container="true"]',
    );

    for (const container of containers) {
      if (!isOriginalPost(container)) {
        continue;
      }

      const text = extractOriginalPost(container);

      if (text) {
        return text;
      }
    }

    return null;
  }

  function extractComment(container) {
    const parts = extractTextBlocks(container);

    if (parts.length === 0) {
      return null;
    }

    let text = parts.join("\n\n").trim();

    text = text.replace(/\n+\d+\n+\/\n+\d+\s*$/, "");

    return text.trim();
  }

  function getContainerId(container) {
    return container.getAttribute("data-interactive-id");
  }

  function getFallbackKey(container) {
    return container.innerText.trim().replace(/\s+/g, " ");
  }

  function extractComments() {
    const containers = document.querySelectorAll(
      '[data-pressable-container="true"]',
    );

    let added = 0;

    for (const container of containers) {
      if (isOriginalPost(container)) {
        continue;
      }

      const id = getContainerId(container);

      if (id) {
        if (processedIds.has(id)) {
          continue;
        }

        const text = extractComment(container);

        if (!text) {
          continue;
        }

        processedIds.add(id);

        comments.push({
          text,
        });

        added++;

        continue;
      }

      const fallbackKey = getFallbackKey(container);

      if (!fallbackKey) {
        continue;
      }

      if (processedFallback.has(fallbackKey)) {
        continue;
      }

      const text = extractComment(container);

      if (!text) {
        continue;
      }

      processedFallback.add(fallbackKey);

      comments.push({
        text,
      });

      added++;
    }

    return added;
  }

  function downloadJson() {
    const data = {
      post: {
        text: postText || "",
      },
      comments,
    };

    const json = JSON.stringify(data, null, 2);

    const blob = new Blob(["\uFEFF", json], {
      type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `threads-comments-${Date.now()}.json`;

    document.body.appendChild(link);

    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  console.clear();
  console.log("======================================");
  console.log("Threads JSON collector started");
  console.log("======================================");

  postText = findOriginalPost();

  if (postText) {
    console.log("Original post: found");
  } else {
    console.log("Original post: not found yet");
  }

  let endChecks = 0;
  let lastScrollHeight = 0;
  let lastCommentCount = 0;

  while (endChecks < CONFIG.maxEndChecks) {
    if (!postText) {
      postText = findOriginalPost();
    }

    const added = extractComments();
    const scrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    const scrollHeight = document.documentElement.scrollHeight;
    const bottom = scrollY + viewportHeight >= scrollHeight - 100;

    console.log(
      "Comments: " +
        comments.length +
        " | Added: " +
        added +
        " | Scroll: " +
        Math.round(scrollY) +
        " / " +
        scrollHeight +
        (bottom ? " | BOTTOM" : ""),
    );

    if (!bottom) {
      window.scrollBy(0, CONFIG.scrollStep);

      await sleep(CONFIG.waitAfterScroll);

      endChecks = 0;

      continue;
    }

    console.log("Reached current bottom. " + "Waiting for more messages...");

    const heightBeforeWait = scrollHeight;
    const commentsBeforeWait = comments.length;

    await sleep(CONFIG.endWait);

    const addedAfterWait = extractComments();

    if (!postText) {
      postText = findOriginalPost();
    }

    const newScrollHeight = document.documentElement.scrollHeight;
    const heightChanged = newScrollHeight !== heightBeforeWait;
    const commentsChanged = comments.length !== commentsBeforeWait;

    if (heightChanged || commentsChanged || addedAfterWait > 0) {
      console.log(
        "More content loaded. Height: " +
          heightBeforeWait +
          " -> " +
          newScrollHeight,
      );

      endChecks = 0;

      window.scrollBy(0, 200);

      await sleep(CONFIG.waitAfterScroll);

      continue;
    }

    endChecks++;

    console.log(
      "No new content. End check " + endChecks + "/" + CONFIG.maxEndChecks,
    );

    window.scrollBy(0, 50);

    await sleep(1000);

    const afterNudgeScrollHeight = document.documentElement.scrollHeight;

    if (
      afterNudgeScrollHeight !== lastScrollHeight ||
      comments.length !== lastCommentCount
    ) {
      endChecks = 0;
    }

    lastScrollHeight = afterNudgeScrollHeight;

    lastCommentCount = comments.length;
  }

  const finalAdded = extractComments();

  if (!postText) {
    postText = findOriginalPost();
  }

  console.log("Final extraction: +" + finalAdded);

  downloadJson();

  console.log("======================================");
  console.log("DONE");
  console.log("======================================");
  console.log("Original post: " + (postText ? "found" : "NOT FOUND"));
  console.log("Collected comments: " + comments.length);
  console.log("Unique Threads IDs: " + processedIds.size);
  console.log("Fallback comments: " + processedFallback.size);
  console.log("JSON file downloaded.");
  console.log("======================================");
})();
