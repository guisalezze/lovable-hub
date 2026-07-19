export default function ExclusaoDados() {
  return (
    <div className="min-h-screen bg-white text-gray-800 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Exclusão de Dados</h1>
      <p className="text-sm text-gray-500 mb-8">Última atualização: julho de 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">Como solicitar a exclusão dos seus dados</h2>
          <p>
            Se você interagiu com uma conta automatizada por este sistema e deseja que seus dados
            sejam removidos permanentemente, siga as instruções abaixo:
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-3">
          <p className="font-medium">Opção 1 — E-mail</p>
          <p>
            Envie um e-mail para{" "}
            <a href="mailto:salezzeguilherme@gmail.com" className="text-blue-600 underline">
              salezzeguilherme@gmail.com
            </a>{" "}
            com o assunto <strong>"Exclusão de dados"</strong> informando seu @username do Instagram.
            Os dados serão excluídos em até 30 dias.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">O que será excluído</h2>
          <ul className="list-disc ml-5 space-y-1">
            <li>ID e username do Instagram associados ao seu contato</li>
            <li>Histórico de mensagens automáticas enviadas para você</li>
            <li>Registro de eventos e interações</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Dados não coletados</h2>
          <p>
            Este sistema não armazena: senha, e-mail, número de telefone, dados bancários,
            localização ou qualquer outra informação pessoal além do ID público e username do Instagram.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Desconexão via Instagram</h2>
          <p>
            Você também pode remover o acesso deste aplicativo diretamente pelo Instagram:
          </p>
          <ol className="list-decimal ml-5 mt-2 space-y-1">
            <li>Abra o Instagram e vá em Configurações</li>
            <li>Toque em "Segurança" → "Apps e sites"</li>
            <li>Encontre o aplicativo e toque em "Remover"</li>
          </ol>
        </div>
      </section>
    </div>
  );
}
