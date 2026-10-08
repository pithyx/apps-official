// Greets in the browser's language; a real app would use @pithyx/sdk for the user and the box.
const greetings = { de: 'Hallo', en: 'Hello' };
const language = navigator.language.slice(0, 2);
document.getElementById('greeting').textContent = greetings[language] ?? greetings.en;
