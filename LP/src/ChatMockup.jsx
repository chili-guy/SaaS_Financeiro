import React, { useState, useEffect, useRef } from 'react';

const messages = [
  // Manhã - Gastos
  { type: 'user', text: 'Nico, gastei 50 reais no almoço', delay: 0 },
  { type: 'bot', text: 'Registrado! R$ 50,00 em Alimentação. Total do dia: R$ 50,00.', icon: 'check_circle', delay: 2600 },
  { type: 'user', text: 'E 15 reais de café da manhã', delay: 3000 },
  { type: 'bot', text: 'Anotado! R$ 15,00 em Alimentação. Total do dia: R$ 65,00.', icon: 'check_circle', delay: 2200 },
  // Lembretes
  { type: 'user', text: 'Me lembre de pagar o condomínio amanhã às 9h', delay: 3400 },
  { type: 'bot', text: 'Lembrete criado para amanhã às 09:00 — Pagar condomínio.', icon: 'notification_add', delay: 2600 },
  { type: 'user', text: 'Também preciso ligar pro dentista segunda-feira', delay: 3000 },
  { type: 'bot', text: 'Agendado! Segunda-feira às 09:00 — Ligar para o dentista.', icon: 'event_available', delay: 2200 },
  // Relatório
  { type: 'user', text: 'Quanto gastei essa semana?', delay: 3800 },
  { type: 'bot', text: 'Essa semana: R$ 412,00. Alimentação: R$ 185. Transporte: R$ 97. Lazer: R$ 130.', icon: 'bar_chart', delay: 3000 },
  { type: 'user', text: 'E no mês?', delay: 2600 },
  { type: 'bot', text: 'No mês atual: R$ 2.340,00 de R$ 3.500 do seu limite. Você está dentro do orçamento! 🎯', icon: 'savings', delay: 3000 },
  // Memória
  { type: 'user', text: 'Onde guardei o documento do carro?', delay: 3800 },
  { type: 'bot', text: 'Você me disse em 12/03 que está na gaveta do escritório, pasta azul.', icon: 'folder', delay: 2600 },
  { type: 'user', text: 'Boa! E o número do seguro?', delay: 2600 },
  { type: 'bot', text: 'Seguro do carro: Apólice #284719 - Porto Seguro. Vence em 15/08.', icon: 'shield', delay: 2600 },
  // Tarefas do trabalho
  { type: 'user', text: 'Preciso entregar o relatório até sexta', delay: 3400 },
  { type: 'bot', text: 'Tarefa criada: "Entregar relatório" — Prazo: sexta-feira. Vou te lembrar na quinta à noite.', icon: 'task_alt', delay: 3000 },
  { type: 'user', text: 'Adiciona também: revisar apresentação do cliente', delay: 3000 },
  { type: 'bot', text: 'Adicionado à sua lista! Você tem 4 tarefas pendentes esta semana.', icon: 'checklist', delay: 2600 },
  // Mais gastos
  { type: 'user', text: 'Paguei 120 de uber hoje', delay: 3400 },
  { type: 'bot', text: 'R$ 120,00 em Transporte. ⚠️ Atenção: você já gastou R$ 217 em transporte este mês, 30% acima da média.', icon: 'warning', delay: 3400 },
  { type: 'user', text: 'Caramba, tá caro mesmo', delay: 2600 },
  { type: 'bot', text: 'Posso te sugerir alternativas? Nos últimos 3 meses, seus gastos com Uber aumentaram 45%.', icon: 'trending_up', delay: 3000 },
  // Compras
  { type: 'user', text: 'Comprei um fone de ouvido por 350 reais', delay: 3400 },
  { type: 'bot', text: 'Registrado! R$ 350,00 em Eletrônicos. Total do dia: R$ 535,00.', icon: 'check_circle', delay: 2200 },
  { type: 'user', text: 'E 89 reais na farmácia', delay: 2600 },
  { type: 'bot', text: 'R$ 89,00 em Saúde. Total do dia atualizado: R$ 624,00.', icon: 'check_circle', delay: 2200 },
  // Notas pessoais
  { type: 'user', text: 'Anota aí: senha do wifi novo é NicoCasa2024', delay: 3400 },
  { type: 'bot', text: 'Salvo nas suas notas pessoais de forma segura. 🔒', icon: 'lock', delay: 2200 },
  { type: 'user', text: 'E o aniversário da minha mãe é dia 22 de abril', delay: 3000 },
  { type: 'bot', text: 'Anotado e lembrete criado para 21/04 — "Comprar presente para a mãe".', icon: 'cake', delay: 2600 },
  // Saúde
  { type: 'user', text: 'Bebi 6 copos de água hoje', delay: 3000 },
  { type: 'bot', text: 'Ótimo progresso! 6/8 copos hoje. Faltam só 2 para bater sua meta diária. 💧', icon: 'water_drop', delay: 2600 },
  { type: 'user', text: 'Fiz 40 minutos de academia', delay: 2600 },
  { type: 'bot', text: 'Registrado! Você treinou 3x esta semana. Parabéns pela consistência! 💪', icon: 'fitness_center', delay: 2600 },
  // Fim do dia
  { type: 'user', text: 'Quais são meus compromissos de amanhã?', delay: 3800 },
  { type: 'bot', text: '09:00 — Pagar condomínio\n10:30 — Reunião com equipe\n14:00 — Call com cliente\n18:00 — Academia', icon: 'calendar_today', delay: 3400 },
  { type: 'user', text: 'Cancela a academia de amanhã', delay: 3000 },
  { type: 'bot', text: 'Removido "Academia" de amanhã. Quer reagendar para outro dia?', icon: 'event_busy', delay: 2600 },
  { type: 'user', text: 'Coloca pra quarta às 18h', delay: 2600 },
  { type: 'bot', text: 'Pronto! Academia reagendada para quarta-feira às 18:00.', icon: 'event_available', delay: 2200 },
  // Resumo
  { type: 'user', text: 'Me dá um resumo do dia', delay: 3400 },
  { type: 'bot', text: '📊 Resumo: Gastou R$ 624,00 | 4 tarefas concluídas | 3 lembretes criados | 6 copos de água | 40min de treino. Dia produtivo!', icon: 'summarize', delay: 3800 },
  { type: 'user', text: 'Valeu Nico! Boa noite', delay: 3000 },
  { type: 'bot', text: 'Boa noite! Descanse bem. Amanhã te lembro de tudo. 🌙', icon: 'bedtime', delay: 2600 },
  // Próximo dia
  { type: 'user', text: 'Bom dia Nico!', delay: 3800 },
  { type: 'bot', text: 'Bom dia! ☀️ Você tem 3 compromissos hoje. Primeiro: Pagar condomínio às 09:00.', icon: 'wb_sunny', delay: 3000 },
  { type: 'user', text: 'Paguei o condomínio, 850 reais', delay: 3000 },
  { type: 'bot', text: 'R$ 850,00 em Moradia. Compromisso "Pagar condomínio" marcado como concluído! ✅', icon: 'check_circle', delay: 2600 },
  { type: 'user', text: 'Quanto já gastei esse mês todo?', delay: 3400 },
  { type: 'bot', text: 'Total do mês: R$ 3.190,00 de R$ 3.500. Restam R$ 310,00 para os próximos 8 dias. Quer ativar o modo economia?', icon: 'account_balance', delay: 3800 },
];

function TypingIndicator() {
  return (
    <div className="bg-[#202c33] p-3 rounded-lg rounded-tl-none max-w-[85%] text-sm self-start flex items-center gap-1.5">
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDuration: '0.6s' }}></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '0.15s' }}></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '0.3s' }}></div>
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  const isBot = message.type === 'bot';

  return (
    <div className="chat-msg-enter">
      {isBot ? (
        <div className="bg-[#202c33] text-white p-3 rounded-lg rounded-tl-none max-w-[85%] text-sm self-start flex items-start gap-2">
          {message.icon && (
            <span className="material-symbols-outlined text-primary text-sm mt-0.5">{message.icon}</span>
          )}
          <span>{message.text}</span>
        </div>
      ) : (
        <div className="bg-[#005c4b] text-white p-3 rounded-lg rounded-tr-none max-w-[85%] text-sm self-end ml-auto">
          {message.text}
        </div>
      )}
    </div>
  );
}

export default function ChatMockup() {
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef(null);

  // Smooth auto-scroll inside chat container only
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [visibleMessages, isTyping]);

  // Message sequence loop
  useEffect(() => {
    if (currentIndex >= messages.length) {
      // Restart the loop after a pause
      const resetTimer = setTimeout(() => {
        setVisibleMessages([]);
        setCurrentIndex(0);
      }, 5000);
      return () => clearTimeout(resetTimer);
    }

    const message = messages[currentIndex];
    const isBot = message.type === 'bot';

    // Show typing indicator before bot messages
    if (isBot) {
      const typingTimer = setTimeout(() => {
        setIsTyping(true);
      }, 500);

      const messageTimer = setTimeout(() => {
        setIsTyping(false);
        setVisibleMessages(prev => [...prev, message]);
        setCurrentIndex(prev => prev + 1);
      }, 600 + 1900); // typing for 1.9s

      return () => {
        clearTimeout(typingTimer);
        clearTimeout(messageTimer);
      };
    } else {
      // User messages appear after a delay
      const messageTimer = setTimeout(() => {
        setVisibleMessages(prev => [...prev, message]);
        setCurrentIndex(prev => prev + 1);
      }, message.delay);

      return () => clearTimeout(messageTimer);
    }
  }, [currentIndex]);

  return (
    <div className="relative w-[340px] md:w-[380px] h-[720px] md:h-[800px] shrink-0 bg-[#121212] rounded-[3rem] p-3 border-[4px] border-[#222] shadow-2xl overflow-hidden">
      {/* Casing reflection - keeping it subtle but less 'glassy' */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none rounded-[3rem]"></div>
      
      <div className="relative z-10 w-full h-full bg-[#0b141a] rounded-[2.3rem] overflow-hidden flex flex-col font-body border border-white/5">
        {/* Chat Header */}
        <div className="bg-[#1f2c34] p-4 flex items-center gap-3 border-b border-black/20">
          <div className="w-10 h-10 rounded-full bg-[#8a4cfc] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-xl">smart_toy</span>
          </div>
          <div>
            <p className="text-white text-sm font-bold">Assessor Nico</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              <p className="text-[#8696a0] text-xs">Online</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={containerRef} className="flex-1 p-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>
          {visibleMessages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}
        </div>

        {/* Chat Input */}
        <div className="bg-[#121b22] p-3 flex items-center gap-2 border-t border-black/20 z-20">
          <div className="flex-1 bg-[#2a3942] rounded-full px-4 py-3 text-xs text-[#8696a0]">Mensagem</div>
          <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center shadow-lg shadow-[#00a884]/20">
            <span className="material-symbols-outlined text-white text-xl">mic</span>
          </div>
        </div>
      </div>
    </div>
  );
}
