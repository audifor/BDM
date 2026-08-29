const output = document.getElementById("output");
const btnPing = document.getElementById("btnPing");
const btnPlayers = document.getElementById("btnPlayers");

function show(data) {
  if (typeof data === "string") {
    output.textContent = data;
    return;
  }
  output.textContent = JSON.stringify(data, null, 2);
}

btnPing.addEventListener("click", async () => {
  try {
    const res = await window.pcbasket.invoke("ping", {});
    show(res);
  } catch (err) {
    show(String(err));
  }
});

btnPlayers.addEventListener("click", async () => {
  try {
    const res = await window.pcbasket.invoke("player.list", { limit: 10, offset: 0 });
    show(res);
  } catch (err) {
    show(String(err));
  }
});

window.pcbasket.on("engine.event", (data) => {
  show({ event: data });
});

window.pcbasket.on("engine.error", (data) => {
  show({ error: data });
});
