# Design System: Assessor Nico
**Project ID:** Local Repository (Assessor Nico)

## 1. Visual Theme & Atmosphere
A estética é **Dark Premium, Tecnológica e Financeira**. O ambiente é construído sobre um espaço profundo e escuro, cortado por brilhos atmosféricos dramáticos e texturas sutis (como ruído fotográfico/noise grain). A vibe é de Inteligência Artificial pura, sofisticação e minimalismo focado. Elementos de vidro fosco (glassmorphism) e neon suave transmitem uma sensação de riqueza digital, segurança criptográfica e organização sem fricção.

## 2. Color Palette & Roles
* **Fundo do Abismo (Deep Abyss Black):** (#0e0e0e) - Usado como cor de fundo universal para garantir contraste absoluto e descanso visual.
* **Roxo Elétrico Primário (Electric Neon Purple):** (#bd9dff) - Usado para os CTAs principais, textos de destaque em gradientes e acentos visuais de importância. Passa a ideia de tecnologia e inovação.
* **Índigo Profundo (Deep Indigo Dim):** (#8a4cfc) - Usado em gradientes, botões com hover e auras atmosféricas (glows).
* **Violeta Atmosférico (Atmospheric Violet):** (#572ba0) - Usado largamente nas bolhas de aurora e brilhos difusos do cenário.
* **Verde Status (Online Green):** (#4ade80) - Usado como cor semântica de "Status Online" ou confirmações de sistema, trazendo a ideia de WhatsApp.
* **Branco Neve (Snow White):** (#ffffff) - Usado para títulos primários (H1, H2) para legibilidade brutalista sobre fundos escuros.
* **Cinza Translúcido (Ghost Gray):** (#ababab) - Usado para parágrafos, subtítulos e textos secundários de apoio (`text-white/80` ou `text-white/50`).

## 3. Typography Rules
* **Títulos Principais (Display/Headline):** Utiliza "Space Grotesk". Títulos são massivos, em peso "Bold" (700), com tracking (espaçamento entre letras) levemente negativo (`tracking-tight` ou `-0.03em`) e leading (altura de linha) super apertado (`leading-[1.02]`) para um bloco sólido e moderno.
* **Corpo de Texto (Body):** Utiliza "Inter". Os parágrafos são finos ("Light" 300 ou "Regular" 400), com entrelinha relaxada (`leading-[1.7]`) para máxima leiturabilidade.

## 4. Component Stylings
* **Botões Primários (CTAs):** Forma de pílula (Pill-shaped, `rounded-full`). Fundo com gradiente vibrante (from `#8a4cfc` to `#6d28d9`), sempre acompanhados de interações de Hover que revelam sombras coloridas (glow) e gradientes secundários.
* **Botões Secundários:** Forma de pílula (`rounded-full`). Fundo em vidro fosco hiper sutil (bg-white/5) com bordas quase invisíveis (`border-white/10`).
* **Cards & Containers (Mockup do Celular):** Bordas generosamente arredondadas (`rounded-[3rem]`). Utilizam simulação física (Glassmorphism), com fundos translúcidos e reflexos de borda (borda em gradiente de branco para transparente).
* **Badges/Chips:** Componentes em forma de pílula hiper compactos (`px-5 py-2`), com muito desfoque de fundo (`backdrop-blur-md`) e bordas translúcidas de contraste mínimo (`border-white/[0.08]`).

## 5. Layout Principles
* O layout favorece **respiros generosos (Airy whitespace)** e alinhamentos assimétricos.
* A estrutura principal utiliza grids equilibrados (geralmente Divisão 50/50 em Desktop).
* Uso abusivo de **Sobreposição de Camadas (Z-index stacking)**: Elementos de texto cristalinos flutuam sobre texturas de ruído, que flutuam sobre brilhos neon massivos (glows), que por sua vez ficam sobre o fundo negro absoluto.