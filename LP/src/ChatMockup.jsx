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
    <div className="flex w-full justify-start chat-msg-enter">
      <div className="bg-[#202c33] px-4 py-3 rounded-[0.8rem] rounded-tl-sm text-sm self-start flex items-center gap-1.5 shadow-sm max-w-[85%] ml-1">
        <div className="flex gap-[3px]">
          <div className="w-1.5 h-1.5 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDuration: '0.6s' }}></div>
          <div className="w-1.5 h-1.5 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '0.15s' }}></div>
          <div className="w-1.5 h-1.5 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '0.3s' }}></div>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  const isBot = message.type === 'bot';
  // Use a pseudo-random time that feels consistent 
  const time = "14:32"; 

  return (
    <div className={`flex w-full chat-msg-enter ${isBot ? 'justify-start' : 'justify-end'} mb-1`}>
      <div className={`relative w-fit px-3.5 pt-2 pb-6 text-[0.95rem] leading-[1.3] text-[#e9edef] rounded-lg shadow-sm max-w-[92%] min-w-[90px] ${
        isBot ? 'bg-[#202c33] rounded-tl-sm ml-1' : 'bg-[#005c4b] rounded-tr-sm mr-1'
      }`}>
        <span className="break-normal whitespace-pre-line text-left block">
          {isBot && message.icon && (
            <span className="material-symbols-outlined text-[#A78BFA] align-middle mr-1.5 mb-1" style={{fontSize: '18px', fontVariationSettings: "'FILL' 1"}}>{message.icon}</span>
          )}
          {message.text}
        </span>
        <div className="absolute bottom-1.5 right-2 .5 flex items-center gap-[4px] select-none">
          <span className="text-[10px] text-white/50 font-medium leading-none tracking-wide mt-px">{time}</span>
          {!isBot && (
            <span className="material-symbols-outlined text-[#53bdeb] leading-none" style={{fontSize: '15px', marginBottom: '-2.5px'}}>done_all</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatMockup({ isStatic = false, staticOffset = 0 }) {
  const [visibleMessages, setVisibleMessages] = useState(isStatic ? messages.slice(staticOffset, staticOffset + 8) : []);
  const [isTyping, setIsTyping] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(isStatic ? 8 : 0);
  const containerRef = useRef(null);

  // Smooth auto-scroll inside chat container only
  useEffect(() => {
    if (containerRef.current) {
      if (isStatic) {
        // Scroll to bottom instantly if it's a static mockup
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      } else {
        containerRef.current.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [visibleMessages, isTyping, isStatic]);

  // Message sequence loop
  useEffect(() => {
    if (isStatic) return; // Do not animate if static

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
  }, [currentIndex, isStatic]);

  return (
    <div className="relative w-full h-full shrink-0 bg-[#0b141a] rounded-[1.8rem] overflow-hidden flex flex-col font-sans">
        {/* Chat Header */}
        <div className="bg-[#202c33] px-2 py-3 flex items-center gap-2 z-20">
          <div className="flex items-center gap-0 text-[#aebac1]">
            <span className="material-symbols-outlined" style={{fontSize: '20px'}}>arrow_back</span>
            <div className="w-9 h-9 rounded-full bg-[#8a4cfc] flex items-center justify-center shrink-0 ml-0.5">
               <span className="material-symbols-outlined text-white text-[1.1rem] pr-0.5">smart_toy</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[#e9edef] text-[0.95rem] font-semibold leading-tight whitespace-nowrap overflow-hidden text-ellipsis">Assessor Nico</h3>
            <p className="text-[#8696a0] text-[0.7rem] leading-tight">online</p>
          </div>
          <div className="flex items-center gap-3.5 text-[#aebac1] mr-0.5">
            <span className="material-symbols-outlined" style={{fontSize: '20px'}}>videocam</span>
            <span className="material-symbols-outlined" style={{fontSize: '18px'}}>call</span>
          </div>
        </div>

        {/* WhatsApp background pattern generic emulation */}
        <div className="absolute inset-0 z-0 bg-[#0b141a] opacity-80" style={{backgroundImage: 'radial-gradient(#202c33 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>

        {/* Messages */}
        <div ref={containerRef} className="flex-1 px-3 py-5 space-y-2.5 overflow-y-auto relative z-10" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>
          
          {/* WhatsApp Day banner */}
          <div className="w-full flex justify-center mb-4">
             <div className="bg-[#182229] text-[#8696a0] text-[0.75rem] uppercase font-medium px-4 py-1.5 rounded-lg shadow-sm">
                Hoje
             </div>
          </div>

          {visibleMessages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}
        </div>

        {/* Chat Input */}
        <div className="bg-[#202c33] px-2 py-2 flex items-center gap-1.5 z-20">
          <div className="flex-1 bg-[#2a3942] rounded-3xl flex items-center px-3 py-2 min-h-[44px]">
            <span className="material-symbols-outlined text-[#8696a0] mr-2" style={{fontSize: '24px'}}>sentiment_satisfied</span>
            <span className="flex-1 text-[0.95rem] text-[#8696a0] font-normal pb-0.5">Mensagem</span>
            <span className="material-symbols-outlined text-[#8696a0] rotate-45 transform ml-1" style={{fontSize: '22px'}}>attach_file</span>
            <span className="material-symbols-outlined text-[#8696a0] ml-3" style={{fontSize: '22px'}}>photo_camera</span>
          </div>
          <div className="w-[44px] h-[44px] rounded-full bg-[#00a884] flex items-center justify-center shrink-0 ml-0.5">
            <span className="material-symbols-outlined text-[#111b21]" style={{fontSize: '24px'}}>mic</span>
          </div>
        </div>
    </div>
  );
}
