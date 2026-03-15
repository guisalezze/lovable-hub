import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Tratamento de erro global para evitar tela branca
window.addEventListener('error', (event) => {
  console.error('Erro global:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Promise rejeitada não tratada:', event.reason);
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento root não encontrado");
}

try {
  createRoot(rootElement).render(<App />);
} catch (error) {
  console.error('Erro ao renderizar app:', error);
  rootElement.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; flex-direction: column; gap: 1rem; padding: 2rem; text-align: center;">
      <h1 style="font-size: 1.5rem; font-weight: bold; color: #ef4444;">Erro ao carregar o app</h1>
      <p style="color: #6b7280;">Por favor, recarregue a página</p>
      <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
        Recarregar
      </button>
    </div>
  `;
}
