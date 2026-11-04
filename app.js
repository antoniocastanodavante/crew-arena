const KEY = "tareas";
const form = document.getElementById("form");
const input = document.getElementById("input");
const list = document.getElementById("list");
const empty = document.getElementById("empty");

let tareas = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(tareas));
}

function render() {
  list.innerHTML = "";
  empty.style.display = tareas.length ? "none" : "block";

  tareas.forEach((t, i) => {
    const li = document.createElement("li");
    if (t.done) li.classList.add("done");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = t.done;
    cb.addEventListener("change", () => {
      tareas[i].done = cb.checked;
      save();
      render();
    });

    const span = document.createElement("span");
    span.className = "text";
    span.textContent = t.text;

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.setAttribute("aria-label", "Eliminar tarea");
    del.addEventListener("click", () => {
      tareas.splice(i, 1);
      save();
      render();
    });

    li.append(cb, span, del);
    list.appendChild(li);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  tareas.push({ text, done: false });
  save();
  input.value = "";
  render();
});

render();
