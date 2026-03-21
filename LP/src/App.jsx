import React, { useState, useEffect } from 'react';
import ChatMockup from './ChatMockup';
import './index.css';

const Logo = ({ className = "h-10", dark = false }) => (
  <div className={`flex items-center gap-2.5 ${className} transition-transform duration-300 hover:scale-[1.05]`} aria-label="Assessor Nico Logo">
    <div className="h-full aspect-square relative flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-sm overflow-visible">
        <defs>
          <linearGradient id="nicoLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{stopColor: '#8B5CF6', stopOpacity: 1}} />
            <stop offset="100%" style={{stopColor: '#7C3AED', stopOpacity: 1}} />
          </linearGradient>
        </defs>
        <path 
          d="M50,15 C30.67,15 15,30.67 15,50 C15,58.85 18.25,66.95 23.6,73.15 L16.5,88.5 L33.25,82.75 C38.35,84.2 43.8,85 50,85 C69.33,85 85,69.33 85,50 C85,30.67 69.33,15 50,15 Z" 
          fill="url(#nicoLogoGrad)"
        />
        <path 
          d="M38 48L47 57L65 39" 
          stroke="white" 
          strokeWidth="8" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          fill="none"
        />
      </svg>
    </div>
    <div className="flex items-center gap-1.5 leading-none py-1">
       <span className="font-black text-[#7C3AED] text-[1.25rem] md:text-[1.5rem] tracking-tighter">Nico</span>
       <span className={`font-medium ${dark ? 'text-white' : 'text-[#64748B]'} text-[1.25rem] md:text-[1.5rem] tracking-tight`}>Assessor</span>
    </div>
  </div>
);

const reviews1 = [
  { name: "João Paulo", role: "Empreendedor", text: "Cara, a melhor coisa que fiz foi usar o Nico. Minha fatura do cartão despencou sem eu nem perceber." },
  { name: "Mariana T.", role: "Autônoma", text: "Não preciso mais lembrar de anotar gastos. Só mando uma mensagem rápida e tá resolvido." },
  { name: "Roberto D.", role: "Médico", text: "A gestão de agenda é sensacional. O Nico me avisa dos horários muito melhor que qualquer app." },
  { name: "Luiza S.", role: "Designer", text: "Achei que ia ser difícil mexer, mas como é tudo direto no teclado do WhatsApp, foi super natural." },
  { name: "Thiago M.", role: "Empresário", text: "Muito bom. Fluxo de caixa de empresa pequena é bagunça, e o Nico organiza tudo perfeitamente." },
  { name: "Camila V.", role: "Arquiteta", text: "Organização nota 1000! Não vivo mais sem o Nico pra lembrar de pagar os fornecedores da obra." }
];

const reviews2 = [
  { name: "Pedro H.", role: "Consultor", text: "Ter meus recebíveis e contas a pagar do mês listados num relatório todo dia cedo mudou a saúde da minha empresa." },
  { name: "Carolina M.", role: "Dentista", text: "Excelente para profissionais da saúde. Registro os retornos e o Nico me avisa de cada um." },
  { name: "Rafael C.", role: "Freelancer", text: "Controlar pagamentos fracionados de clientes era meu terror. O assessor virtual transformou esse pesadelo numa notificação simples." },
  { name: "Bruno L.", role: "Gestor Clínico", text: "Simplicidade pura, meus funcionários só lançam no WhatsApp e está tudo registrado. Adeus planilha de drive." },
  { name: "Isabela R.", role: "Social Media", text: "Sou 100% dinâmica e a praticidade do WhatsApp foi a combinação que eu precisava pra minha rotina corrida." },
  { name: "Gabriel S.", role: "Lojista", text: "Lançar cada entrada agora é rápido. O fechamento de caixa que levava 2 horas, hoje eu bato tudo em 5 minutos com o Nico." }
];

const faqs = [
  {
    q: "Como o Nico funciona na prática?",
    a: "É muito simples. Você adiciona o número do Nico no seu WhatsApp como se fosse um contato normal. Sempre que tiver um gasto, receber um pagamento ou precisar marcar um compromisso, basta mandar uma mensagem de texto ou áudio (ex: 'Gastei 150 reais no supermercado'). O Nico entende, categoriza e lança no seu painel automaticamente."
  },
  {
    q: "Meus dados financeiros estão seguros?",
    a: "Sim, utilizamos criptografia de ponta-a-ponta nativa do WhatsApp e bancos de dados isolados. O que significa que os detalhes financeiros trocados na plataforma não são visíveis a humanos. Seu painel web tem camadas extras de autenticação."
  },
  {
    q: "Preciso baixar algum aplicativo?",
    a: "Não! A grande vantagem do Nico é que 90% da sua interação diária acontece pelo aplicativo que você já usa: o WhatsApp. Seus relatórios, configurações e gráficos detalhados podem ser acessados via navegador de internet em um painel web que não requer instalação de nada novo."
  },
  {
    q: "O Nico entende áudios longos ou gírias?",
    a: "A nossa IA (assessor financeiro) é treinada especificamente para o português fluído e informal falado no Brasil. Incluindo sotaques, abreviações de bancos e gírias. Você pode mandar um áudio de 2 minutos narrando vários gastos de uma obra, e ele organizará um por um perfeitamente."
  },
  {
    q: "E se eu errar uma informação na mensagem, como corrijo?",
    a: "É tão orgânico quanto conversar com um humano. Basta você enviar logo em seguida: 'Nico, desculpe, o gasto anterior não foi no débito, foi no crédito em 3x'. Ele compreende o contexto temporal e atualiza a entrada anterior antes que feche qualquer relatório do dia."
  }
];

function FAQItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-[#e2e8f0] py-6 last:border-b-0">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-full flex justify-between items-center text-left transition-colors group"
      >
        <span className="font-headline font-bold text-[#111827] text-[1.05rem] md:text-[1.15rem] group-hover:text-[#7C3AED] transition-colors">{question}</span>
        <span className={`material-symbols-outlined text-[#7C3AED] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
        <p className="font-body text-[#64748B] text-[1rem] leading-[1.7] pr-8">{answer}</p>
      </div>
    </div>
  );
}

function App() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-white text-[#111827] font-body selection:bg-[#7C3AED]/20 selection:text-[#7C3AED] overflow-x-hidden">
      
      {/* Navigation */}
      <nav className="relative w-full z-50 bg-white">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-6 border-b border-transparent">
          {/* Brand Logo - Nico Assessor */}
          <a href="/" className="flex items-center">
            <Logo className="h-10 md:h-12" />
          </a>
          
          {/* Links */}
          <div className="hidden md:flex items-center space-x-10 font-body text-[0.95rem] font-medium text-[#64748B]">
            <a className="hover:text-[#7C3AED] transition-colors" href="#como-funciona">Como funciona</a>
            <a className="hover:text-[#7C3AED] transition-colors" href="#avaliacoes">Avaliações</a>
            <a className="hover:text-[#7C3AED] transition-colors" href="#planos">Planos</a>
          </div>
          
          {/* Login Button */}
          <a className="bg-[#7C3AED] text-white px-7 py-2.5 rounded-full text-[0.9rem] font-body font-semibold hover:bg-[#4C1D95] transition-all duration-300 flex items-center gap-2" href="#">
            <span className="material-symbols-outlined text-[18px]">login</span>
            Login
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 pb-0 flex flex-col items-center justify-center text-center px-4 overflow-hidden bg-white" id="como-funciona">
        <div className="max-w-[900px] relative z-10 mx-auto flex flex-col items-center">
          
          {/* Top subtle text */}
          <p className="text-[#7C3AED] text-[13px] md:text-[0.9rem] font-body font-semibold tracking-wide mb-5">
            Você ainda tá tentando lembrar tudo de cabeça ou não sabe pra onde está indo seu dinheiro?
          </p>
          
          {/* Main Headline */}
          <h1 className="text-4xl md:text-[3.4rem] font-headline font-bold leading-[1.05] tracking-tight text-[#111827] mb-12">
            Tenha um assessor pessoal<br/>trabalhando 24 horas por dia pra você
          </h1>

          {/* 3 Feature Badges */}
          <div className="flex flex-col md:flex-row gap-4 mb-12 justify-center w-full">
            {/* Feature 1 */}
            <div className="flex items-center gap-4 bg-[#F1F5F9] border border-[#e2e8f0] p-4 rounded-2xl text-left w-full md:w-[260px] shadow-sm">
              <span className="material-symbols-outlined text-[#eab308] text-2xl">lock</span>
              <div>
                <p className="font-headline font-bold text-[0.85rem] text-[#111827] leading-tight mb-0.5">criptografia de<br/>ponta-a-ponta</p>
                <p className="text-[0.7rem] text-[#64748B] font-body font-medium">Seus dados protegidos.</p>
              </div>
            </div>
            {/* Feature 2 */}
            <div className="flex items-center gap-4 bg-[#F1F5F9] border border-[#e2e8f0] p-4 rounded-2xl text-left w-full md:w-[260px] shadow-sm">
              <span className="material-symbols-outlined text-[#7C3AED] text-2xl">chat_bubble</span>
              <div>
                <p className="font-headline font-bold text-[0.85rem] text-[#111827] leading-tight mb-0.5">99.9% de precisão</p>
                <p className="text-[0.7rem] text-[#64748B] font-body font-medium">IA que entende português.</p>
              </div>
            </div>
            {/* Feature 3 */}
            <div className="flex items-center gap-4 bg-[#F1F5F9] border border-[#e2e8f0] p-4 rounded-2xl text-left w-full md:w-[260px] shadow-sm">
              <span className="material-symbols-outlined text-[#111827] text-2xl">edit_document</span>
              <div>
                <p className="font-headline font-bold text-[0.85rem] text-[#111827] leading-tight mb-0.5">cria ou edita<br/>mensagens</p>
                <p className="text-[0.7rem] text-[#64748B] font-body font-medium">Direto no WhatsApp.</p>
              </div>
            </div>
          </div>

          {/* Green CTA Button  */}
          <a href="https://wa.me/assessornico" className="bg-[#22c55e] text-white font-headline font-bold text-[0.9rem] px-12 py-4 rounded-full hover:bg-[#16a34a] hover:-translate-y-0.5 transition-all duration-300 shadow-md mb-14 uppercase flex items-center justify-center gap-2 tracking-wide">
            QUERO SER UM ASSESSOR
            <span className="material-symbols-outlined font-black text-xl">arrow_right_alt</span>
          </a>
        </div>

        {/* 3 Mobile Phones Mockup */}
        <div className="relative w-full max-w-5xl mx-auto h-auto z-10 flex justify-center gap-3 md:gap-6 px-2 md:px-4 items-center mb-24">
          {/* Left Phone */}
          <div className="w-[48%] md:w-[300px] z-10">
             <div className="rounded-[2.5rem] bg-[#111b21] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[6px] md:border-[8px] border-[#222] overflow-hidden aspect-[9/19]">
                <ChatMockup isStatic={true} staticOffset={0} />
             </div>
          </div>
          {/* Center Phone */}
          <div className="w-[48%] md:w-[300px] z-10">
              <div className="rounded-[2.5rem] bg-[#111b21] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[6px] md:border-[8px] border-[#222] overflow-hidden aspect-[9/19]">
                <ChatMockup />
              </div>
          </div>
          {/* Right Phone */}
          <div className="w-[48%] md:w-[300px] z-10 hidden md:block">
             <div className="rounded-[2.5rem] bg-[#111b21] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[6px] md:border-[8px] border-[#222] overflow-hidden aspect-[9/19]">
                <ChatMockup isStatic={true} staticOffset={44} />
             </div>
          </div>
        </div>
      </section>

      {/* Full Width Theme Banner */}
      <section className="w-full bg-[#7C3AED] text-white py-14 px-6 relative z-20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
           <div className="md:w-1/2 flex items-center justify-center md:justify-center">
             <div className="relative text-center">
               <h2 className="text-4xl md:text-[3rem] font-headline font-extrabold leading-[1.05]">
                 Sua vida<br/>organizada.<br/>
                 <span className="relative inline-block border-[3px] border-white rounded-full px-6 py-1 mt-2 rotate-[-3deg]">
                    Sem esforço.
                 </span>
               </h2>
             </div>
           </div>
           <div className="md:w-1/2 font-body text-[1.1rem] leading-[1.6]">
             <p className="mb-4 font-medium">
               Já se perdeu no meio de tarefas e despesas?<br/>Esqueceu compromissos ou levou um susto com a fatura do cartão?
             </p>
             <p className="font-bold">
               O <strong className="text-[#a78bfa]">Assessor Nico</strong> resolve isso: organização financeira e gestão de compromissos, tudo de forma simples e direta pelo WhatsApp.
             </p>
           </div>
        </div>
      </section>

      {/* Block 1: FINANCEIRO */}
      <section className="py-24 px-6 bg-white border-b border-[#F1F5F9]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 flex flex-col items-start text-left">
            <div className="relative mb-6 block">
              <h2 className="text-5xl md:text-[4rem] font-headline font-bold text-[#111827] tracking-tight uppercase">FINANCEIRO</h2>
              <div className="absolute -bottom-2 left-0 w-24 h-1.5 bg-[#7C3AED] rounded-full"></div>
            </div>
            
            <p className="text-[#64748B] font-body text-lg leading-[1.7] mb-6 mt-4">
              <strong className="text-[#111827]">Assessor Nico Financeiro</strong> organiza sua vida financeira sem planilhas. Basta enviar: <em className="text-[#7C3AED]">"Gastei 50 no almoço"</em> ou <em className="text-[#7C3AED]">"Paguei 200 de luz hoje"</em>.
            </p>
            <p className="text-[#64748B] font-body text-lg leading-[1.7] mb-8">
              A inteligência artificial classifica automaticamente a categoria (Alimentação, Moradia, etc.) e extrai valores e datas para o seu controle total.
            </p>
            <p className="text-[#111827] font-body italic font-bold text-lg mb-10 text-pretty">
              Tudo registrado em segundos, estruturado em banco de dados e pronto para consulta.
            </p>

            <a href="https://wa.me/assessornico" className="bg-[#7C3AED] text-white font-headline font-bold px-10 py-3.5 rounded-full hover:bg-[#4C1D95] transition-colors duration-300 uppercase tracking-wide text-sm shadow-md">
              CONTRATAR AGORA →
            </a>
          </div>
          <div className="order-1 lg:order-2">
            <img src="/dashboard-mockup.png" alt="Dashboard" className="w-full rounded-[1.5rem] shadow-[0_20px_50px_rgba(124,58,237,0.1)] border border-[#F1F5F9]"/>
          </div>
        </div>
      </section>

      {/* Block 2: COMPROMISSOS */}
      <section className="py-24 px-6 bg-[#F1F5F9] border-b border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="order-1 flex justify-center">
            <img src="/phone-mockup.png" alt="Compromissos Mockup" className="w-[85%] rounded-[1.5rem] shadow-[0_20px_50px_rgba(124,58,237,0.1)] border border-white"/>
          </div>
          <div className="order-2 flex flex-col items-start lg:pl-12">
            <div className="relative mb-6 block">
              <h2 className="text-5xl md:text-[3.5rem] font-headline font-bold text-[#111827] tracking-tight uppercase">COMPROMISSOS</h2>
              <div className="absolute -bottom-2 left-0 w-24 h-1.5 bg-[#7C3AED] rounded-full"></div>
            </div>
            
            <p className="text-[#64748B] font-body text-lg leading-[1.7] mb-6 mt-4">
              <strong className="text-[#111827]">Assessor Nico Compromissos</strong> é seu secretário 24h. Registre tarefas e lembretes com linguagem natural: <em className="text-[#7C3AED]">"Tenho consulta médica dia 25 às 10h"</em>.
            </p>
            <p className="text-[#64748B] font-body text-lg leading-[1.7] mb-8">
              O sistema identifica o horário e te envia uma mensagem de lembrete no WhatsApp exatamente quando você precisar.
            </p>
            <p className="text-[#111827] font-body italic font-bold text-lg mb-10 text-pretty">
              Nunca mais esqueça uma reunião, tarefa pendente ou data importante.
            </p>

            <a href="https://wa.me/assessornico" className="bg-[#7C3AED] text-white font-headline font-bold px-10 py-3.5 rounded-full hover:bg-[#4C1D95] transition-colors duration-300 uppercase tracking-wide text-sm shadow-md">
              CONTRATAR AGORA →
            </a>
          </div>
        </div>
      </section>

      {/* Block 3: Registre tudo no WhatsApp */}
      <section className="py-24 px-6 bg-white border-b border-[#F1F5F9]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 flex flex-col items-start text-left">
            <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight mb-8">
              Registre tudo no<br/>WhatsApp
            </h2>
            <p className="text-[#64748B] font-body text-lg leading-[1.7] mb-8">
              Envie uma mensagem e nosso assistente lança tudo automaticamente.
            </p>
            <ul className="space-y-5 mb-10">
               <li className="flex items-center gap-3 text-[#111827] font-body font-medium text-lg">
                  <span className="w-2 h-2 rounded-full bg-[#7C3AED]"></span>
                  Classificação automática de intenção
               </li>
               <li className="flex items-center gap-3 text-[#111827] font-body font-medium text-lg">
                  <span className="w-2 h-2 rounded-full bg-[#7C3AED]"></span>
                  Extração de valores, datas e descrições
               </li>
               <li className="flex items-center gap-3 text-[#111827] font-body font-medium text-lg">
                  <span className="w-2 h-2 rounded-full bg-[#7C3AED]"></span>
                  Armazenamento seguro em PostgreSQL
               </li>
               <li className="flex items-center gap-3 text-[#111827] font-body font-medium text-lg">
                  <span className="w-2 h-2 rounded-full bg-[#7C3AED]"></span>
                  Respostas em tempo real no seu chat
               </li>
            </ul>
          </div>
          <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
             <div className="w-full max-w-[340px] rounded-[2.5rem] bg-[#111] shadow-[0_20px_50px_rgba(124,58,237,0.15)] border-[6px] border-[#2a2a2a] overflow-hidden aspect-[9/19]">
                <ChatMockup isStatic={true} staticOffset={0} />
             </div>
          </div>
        </div>
      </section>

      {/* Block 4: Inteligência e Tecnologia */}
      <section className="py-24 px-6 bg-[#F1F5F9] border-b border-white">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="order-1">
             <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-[#e2e8f0]">
                <div className="space-y-6">
                   <div className="flex gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <span className="material-symbols-outlined text-[#7C3AED] mt-1">psychology</span>
                      <div>
                        <h4 className="font-headline font-bold text-[#111827]">Processamento Natural</h4>
                        <p className="text-[#64748B] text-sm leading-relaxed">Nossa IA classifica se é uma tarefa, gasto ou anotação sem você precisar clicar em nada.</p>
                      </div>
                   </div>
                   <div className="flex gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <span className="material-symbols-outlined text-[#7C3AED] mt-1">database</span>
                      <div>
                        <h4 className="font-headline font-bold text-[#111827]">PostgreSQL</h4>
                        <p className="text-[#64748B] text-sm leading-relaxed">Dados estruturados e seguros com histórico completo das suas interações.</p>
                      </div>
                   </div>
                   <div className="flex gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <span className="material-symbols-outlined text-[#7C3AED] mt-1">cloud_done</span>
                      <div>
                        <h4 className="font-headline font-bold text-[#111827]">Disponibilidade 24/7</h4>
                        <p className="text-[#64748B] text-sm leading-relaxed">Hospedagem em nuvem garantindo que seu assessor nunca pare de trabalhar.</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>
          <div className="order-2 flex flex-col items-start lg:pl-12">
            <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight mb-8">
              Inteligência que<br/>te entende
            </h2>
            <p className="text-[#64748B] font-body text-[1.1rem] leading-[1.7] mb-8">
              O Nico não é apenas um bot. Ele usa modelos de IA para interpretar o que você escreve e estruturar a informação da maneira correta.
            </p>
            <p className="text-[#111827] font-body italic font-bold text-lg mb-10 text-pretty">
              Tecnologia de ponta a serviço da sua produtividade diária.
            </p>
          </div>
        </div>
      </section>


      {/* Planos Section */}
      <section id="planos" className="py-24 px-6 bg-white border-b border-[#F1F5F9]">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="relative mb-4 block text-center">
            <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight text-center">Conheça nossos planos</h2>
          </div>
          <p className="text-[#64748B] font-body text-lg text-center leading-[1.7] max-w-2xl mb-16">
            Organização financeira e pessoal direto no WhatsApp 24h por dia.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full items-stretch">
            {/* Info Card Left: Praticidade */}
            <div className="bg-[#F8FAFC] rounded-[2rem] p-8 border border-[#E2E8F0] flex flex-col items-start shadow-sm transition-transform hover:-translate-y-1 duration-300">
               <div className="w-12 h-12 rounded-2xl bg-[#7C3AED]/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-[#7C3AED] text-2xl">bolt</span>
               </div>
               <h3 className="text-[#111827] font-headline font-extrabold text-2xl mb-4 italic uppercase tracking-tight">Agilidade Máxima</h3>
               <p className="text-[#64748B] font-body text-[1rem] leading-[1.6] mb-6">
                  Esqueça apps complexos. O Nico vive onde você já está: no WhatsApp. Lançar um gasto leva menos de 5 segundos.
               </p>
               <ul className="space-y-4 mt-auto">
                  <li className="flex items-center gap-3 text-sm font-body font-bold text-[#111827]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]"></span>
                     Sem senha para lembrar
                  </li>
                  <li className="flex items-center gap-3 text-sm font-body font-bold text-[#111827]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]"></span>
                     Interface familiar
                  </li>
                  <li className="flex items-center gap-3 text-sm font-body font-bold text-[#111827]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]"></span>
                     Resposta instantânea
                  </li>
               </ul>
            </div>

            {/* Main Pricing Card: Plano Nico */}
            <div className="bg-[#0B1120] text-white rounded-[2rem] p-8 md:p-10 shadow-[0_40px_80px_rgba(11,17,32,0.25)] flex flex-col items-start border border-[#1f2937] relative overflow-hidden group transition-transform hover:scale-[1.02] duration-300 ring-4 ring-[#7C3AED]/30 ring-offset-4 ring-offset-white">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] bg-[#7C3AED]/20 blur-[80px] rounded-full pointer-events-none z-0"></div>
              
              <div className="relative z-10 w-full">
                <div className="inline-flex items-center gap-2 bg-[#7C3AED] px-4 py-1.5 rounded-full text-xs font-headline mb-8">
                  <span className="font-black text-white tracking-widest uppercase">PLANO COMPLETO</span>
                </div>

                <div className="flex items-baseline gap-1.5 mb-2">
                   <span className="text-[#9ca3af] font-body font-bold text-xl">R$</span>
                   <span className="text-white font-headline font-black text-[5rem] leading-none tracking-tighter">9,90</span>
                   <span className="text-[#9ca3af] font-body font-medium">/mês</span>
                </div>
                <p className="text-[#9ca3af] text-[0.85rem] font-body mb-8 italic">Ideal para organização pessoal e familiar</p>

                <div className="flex flex-col gap-3 mb-8">
                   <p className="text-[#e5e7eb] font-body text-[0.85rem] leading-[1.5]">
                     <span className="font-bold text-[#A78BFA]">Bônus:</span> De R$119 por R$0 — Gestão Compartilhada.
                   </p>
                   <p className="text-[#e5e7eb] font-body text-[0.85rem] leading-[1.5]">
                     <span className="font-bold text-[#A78BFA]">Bônus:</span> De R$79 por R$0 — Alertas VIP 24h.
                   </p>
                </div>

                <hr className="w-full border-[#1f2937] mb-8" />

                <ul className="flex flex-col gap-3.5 mb-10 w-full">
                   {[
                     "Registro de compromissos e tarefas",
                     "Registro de gastos e receitas",
                     "Classificação automática por IA",
                     "Lembretes ilimitados via WhatsApp",
                     "Consultas de itens em tempo real",
                     "Resumo diário da sua rotina"
                   ].map((feature, i) => (
                     <li key={i} className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-[#22c55e] text-[1.1rem] mt-0.5" style={{fontVariationSettings: "'FILL' 1, 'wght' 700"}}>check</span>
                        <span className="text-[#e5e7eb] font-body text-[0.85rem] font-medium leading-[1.4]">{feature}</span>
                     </li>
                   ))}
                </ul>

                <a href="https://wa.me/assessornico?text=Quero%20assinar%20o%20plano" className="block w-full bg-[#22c55e] text-white text-center font-headline font-bold text-[1.1rem] py-4 rounded-full hover:bg-[#16a34a] transition-all duration-300 shadow-[0_15px_30px_rgba(34,197,94,0.3)] mb-4">
                   Garanta Já
                </a>
                
                <p className="w-full text-center text-[#9ca3af] text-[10px] font-body font-bold uppercase tracking-widest">
                   Preço promocional vitalício
                </p>
              </div>
            </div>

            {/* Info Card Right: Segurança */}
            <div className="bg-[#F8FAFC] rounded-[2rem] p-8 border border-[#E2E8F0] flex flex-col items-start shadow-sm transition-transform hover:-translate-y-1 duration-300">
               <div className="w-12 h-12 rounded-2xl bg-[#22c55e]/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-[#22c55e] text-2xl">security</span>
               </div>
               <h3 className="text-[#111827] font-headline font-extrabold text-2xl mb-4 italic uppercase tracking-tight">Dados Blindados</h3>
               <p className="text-[#64748B] font-body text-[1rem] leading-[1.6] mb-6">
                  Sua privacidade é prioridade. Utilizamos infraestrutura robusta para garantir que suas anotações estejam sempre seguras.
               </p>
               <ul className="space-y-4 mt-auto">
                  <li className="flex items-center gap-3 text-sm font-body font-bold text-[#111827]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
                     Criptografia de ponta
                  </li>
                  <li className="flex items-center gap-3 text-sm font-body font-bold text-[#111827]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
                     Backup automático diário
                  </li>
                  <li className="flex items-center gap-3 text-sm font-body font-bold text-[#111827]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
                     Privacidade total (IA Only)
                  </li>
               </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Avaliações com Scroll Infinito (2 Fileiras) */}
      <section id="avaliacoes" className="py-28 bg-white overflow-hidden">
        <div className="max-w-6xl mx-auto flex flex-col items-center mb-16 px-6">
          <div className="relative mb-6 block text-center">
             <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight text-center uppercase">O QUE DIZEM NOSSOS CLIENTES</h2>
             <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-1.5 bg-[#7C3AED] rounded-full"></div>
          </div>
          <p className="text-[#64748B] font-body text-lg text-center leading-[1.7] max-w-2xl mt-4">
            Profissionais que pararam de perder tempo preenchendo planilhas e começaram a aproveitar mais a vida usando o Nico.
          </p>
        </div>

        {/* Marquee Container with 2 Rows */}
        <div className="relative w-full max-w-[1500px] mx-auto overflow-hidden before:absolute before:left-0 before:top-0 before:z-20 before:h-full before:w-[50px] md:before:w-[200px] before:bg-gradient-to-r before:from-white before:to-transparent after:absolute after:right-0 after:top-0 after:z-20 after:h-full after:w-[50px] md:after:w-[200px] after:bg-gradient-to-l after:from-white after:to-transparent flex flex-col gap-6">
          
          {/* Row 1: Scrolling Left */}
          <div className="flex w-max animate-marquee hover:[animation-play-state:paused] gap-6 px-3">
             {[...reviews1, ...reviews1, ...reviews1].map((review, i) => (
               <div key={`r1-${i}`} className="flex-shrink-0 w-[350px] md:w-[400px] p-8 rounded-[1.5rem] bg-[#F1F5F9] border border-[#e2e8f0] flex flex-col justify-between transition-transform duration-300 hover:scale-[1.02] cursor-default">
                  <div className="mb-8">
                    <div className="flex gap-1 text-[#eab308] mb-6">
                        {[...Array(5)].map((_, index) => (
                           <svg key={index} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                             <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                           </svg>
                        ))}
                     </div>
                    <p className="text-[#111827] font-body text-[1.05rem] leading-[1.65] font-medium">"{review.text}"</p>
                  </div>
                  <div className="flex items-center gap-4 border-t border-[#e2e8f0] pt-6">
                     <div className="w-12 h-12 rounded-full bg-[#7C3AED] font-headline font-bold text-lg text-white flex items-center justify-center">
                        {review.name.charAt(0)}
                     </div>
                     <div>
                       <p className="text-[#111827] font-headline font-bold text-[0.95rem] tracking-wide">{review.name}</p>
                       <p className="text-[#64748B] font-body font-medium text-sm">{review.role}</p>
                     </div>
                  </div>
               </div>
             ))}
          </div>

          {/* Row 2: Scrolling Right */}
          <div className="flex w-max animate-marquee-reverse hover:[animation-play-state:paused] gap-6 px-3">
             {[...reviews2, ...reviews2, ...reviews2].map((review, i) => (
               <div key={`r2-${i}`} className="flex-shrink-0 w-[350px] md:w-[400px] p-8 rounded-[1.5rem] bg-[#F1F5F9] border border-[#e2e8f0] flex flex-col justify-between transition-transform duration-300 hover:scale-[1.02] cursor-default">
                  <div className="mb-8">
                    <div className="flex gap-1 text-[#eab308] mb-6">
                        {[...Array(5)].map((_, index) => (
                           <svg key={index} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                             <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                           </svg>
                        ))}
                     </div>
                    <p className="text-[#111827] font-body text-[1.05rem] leading-[1.65] font-medium">"{review.text}"</p>
                  </div>
                  <div className="flex items-center gap-4 border-t border-[#e2e8f0] pt-6">
                     <div className="w-12 h-12 rounded-full bg-[#A78BFA] font-headline font-bold text-lg text-[#111827] flex items-center justify-center">
                        {review.name.charAt(0)}
                     </div>
                     <div>
                       <p className="text-[#111827] font-headline font-bold text-[0.95rem] tracking-wide">{review.name}</p>
                       <p className="text-[#64748B] font-body font-medium text-sm">{review.role}</p>
                     </div>
                  </div>
               </div>
             ))}
          </div>

        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6 bg-[#F1F5F9] border-t border-[#e2e8f0]">
        <div className="max-w-4xl mx-auto">
          <div className="relative mb-14 block text-center">
             <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight text-center uppercase">PERGUNTAS FREQUENTES</h2>
             <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-1.5 bg-[#7C3AED] rounded-full"></div>
          </div>
          
          <div className="bg-white rounded-[1.5rem] p-6 md:p-10 shadow-sm border border-[#e2e8f0]">
             {faqs.map((faq, idx) => (
                <FAQItem key={idx} question={faq.q} answer={faq.a} />
             ))}
          </div>
          
          <div className="mt-16 text-center">
             <p className="text-[#64748B] font-body mb-6 font-medium text-lg">Ainda tem dúvidas? Fale com suporte humano.</p>
             <a href="https://wa.me/assessornico?text=Tenho%20d%C3%BAvidas" className="inline-flex items-center gap-3 bg-white text-[#111827] font-headline font-bold px-10 py-4 rounded-full hover:bg-[#e2e8f0] transition-colors border border-[#cbd5e1] shadow-sm tracking-wide text-sm">
               <span className="material-symbols-outlined text-[#22c55e] text-xl">support_agent</span>
               FALAR COM ATENDENTE
             </a>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="bg-[#0B1120] text-white pt-24 pb-12 px-6 border-t border-[#1f2937] relative z-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
            {/* Brand Col */}
            <div className="flex flex-col gap-6">
              <a href="/" className="flex items-center -ml-2">
                <Logo className="h-10 md:h-12" dark={true} />
              </a>
              <p className="text-[#94A3B8] font-body text-[1rem] leading-[1.6] max-w-sm">
                O assistente inteligente que organiza sua vida financeira e compromissos diretamente pelo WhatsApp.
              </p>
              <div className="flex gap-4">
                 <a href="#" className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center hover:bg-[#7C3AED] transition-all duration-300">
                    <span className="material-symbols-outlined text-sm text-white">facebook</span>
                 </a>
                 <a href="#" className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center hover:bg-[#7C3AED] transition-all duration-300">
                    <span className="material-symbols-outlined text-sm text-white">alternate_email</span>
                 </a>
              </div>
            </div>

            {/* Links Col 1 */}
            <div>
              <h4 className="font-headline font-bold text-white mb-8 text-lg uppercase tracking-wider">Produto</h4>
              <ul className="flex flex-col gap-4 text-[#94A3B8] font-body">
                <li><a href="#hero" className="hover:text-[#A78BFA] transition-colors">Como funciona</a></li>
                <li><a href="#planos" className="hover:text-[#A78BFA] transition-colors">Planos e Preços</a></li>
                <li><a href="#avaliacoes" className="hover:text-[#A78BFA] transition-colors">Depoimentos</a></li>
                <li><a href="#faq" className="hover:text-[#A78BFA] transition-colors">Dúvidas Comuns</a></li>
              </ul>
            </div>

            {/* Links Col 2 */}
            <div>
              <h4 className="font-headline font-bold text-white mb-8 text-lg uppercase tracking-wider">Suporte</h4>
              <ul className="flex flex-col gap-4 text-[#94A3B8] font-body">
                <li><a href="#" className="hover:text-[#A78BFA] transition-colors">Central de Ajuda</a></li>
                <li><a href="#" className="hover:text-[#A78BFA] transition-colors">Termos de Uso</a></li>
                <li><a href="#" className="hover:text-[#A78BFA] transition-colors">Privacidade</a></li>
                <li><a href="#" className="hover:text-[#A78BFA] transition-colors">Contato</a></li>
              </ul>
            </div>

            {/* Contact Col */}
            <div className="flex flex-col gap-6">
              <h4 className="font-headline font-bold text-white mb-2 text-lg uppercase tracking-wider">Fale Conosco</h4>
              <div className="flex items-center gap-4 group">
                 <div className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center group-hover:bg-[#22c55e] transition-colors">
                    <span className="material-symbols-outlined text-white text-lg">call</span>
                 </div>
                 <span className="text-[#94A3B8] font-body">(91) 99126-6136</span>
              </div>
              <div className="flex items-center gap-4 group">
                 <div className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center group-hover:bg-[#7C3AED] transition-colors">
                    <span className="material-symbols-outlined text-white text-lg">mail</span>
                 </div>
                 <span className="text-[#94A3B8] font-body">ramonsousa1301@gmail.com</span>
              </div>
            </div>
          </div>

          <div className="pt-12 border-t border-[#1f2937] flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[#64748B] font-body text-sm">
              © 2026 Assessor Nico. Todos os direitos reservados.
            </p>
            <div className="flex gap-8 text-[#64748B] font-body text-sm">
              <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
              <a href="#" className="hover:text-white transition-colors">Termos de Serviço</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
