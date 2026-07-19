export default function Privacidade() {
  return (
    <div className="min-h-screen bg-white text-gray-800 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
      <p className="text-sm text-gray-500 mb-8">Última atualização: julho de 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Sobre este aplicativo</h2>
          <p>
            Este aplicativo é utilizado internamente para automação de mensagens no Instagram, conectando
            contas profissionais da plataforma via API oficial da Meta. Não é um produto de acesso público.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Dados coletados</h2>
          <p>
            Coletamos apenas os dados necessários para o funcionamento das automações:
          </p>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>ID público do usuário do Instagram que interage com os posts</li>
            <li>Nome de usuário (@username) do Instagram</li>
            <li>Texto dos comentários que acionam as automações</li>
            <li>Histórico de mensagens enviadas automaticamente</li>
          </ul>
          <p className="mt-2">
            Não coletamos senhas, dados bancários, localização ou qualquer informação sensível.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Uso dos dados</h2>
          <p>
            Os dados são utilizados exclusivamente para:
          </p>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>Identificar se um comentário corresponde a uma palavra-chave configurada</li>
            <li>Enviar mensagens diretas automáticas em resposta a comentários</li>
            <li>Registrar o histórico de interações para evitar envios duplicados</li>
          </ul>
          <p className="mt-2">
            Não compartilhamos, vendemos nem transferimos nenhum dado a terceiros.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Armazenamento e segurança</h2>
          <p>
            Os dados são armazenados em banco de dados seguro com acesso restrito.
            O token de acesso da conta do Instagram é armazenado de forma segura e renovado
            automaticamente. Nunca armazenamos senhas da conta.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Seus direitos</h2>
          <p>
            Você pode solicitar a exclusão de todos os seus dados a qualquer momento.
            Acesse nossa{" "}
            <a href="/exclusao-de-dados" className="text-blue-600 underline">
              página de exclusão de dados
            </a>{" "}
            para mais informações.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Contato</h2>
          <p>
            Para dúvidas sobre privacidade, entre em contato pelo e-mail:{" "}
            <a href="mailto:salezzeguilherme@gmail.com" className="text-blue-600 underline">
              salezzeguilherme@gmail.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
