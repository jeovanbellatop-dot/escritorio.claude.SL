# Escritório virtual para o Claude Code

Um painel ao lado do chat do Claude Code com um bonequinho para cada janela (sessão) aberta
no seu computador, e um "ajudante" para cada subagente. Enquanto o Claude executa, o bonequinho
digita no computador e mostra a ferramenta em uso (Bash, Edit...). Quando termina, ele para e
toma um café (z Z z).

## Instalação

No Claude Code do seu computador, digite:

```
/plugin install escritorio --marketplace jeovanbellatop-dot/escritorio.claude.SL
```

Responda `y` para adicionar o marketplace e escolha onde instalar (para você, recomendado).
Depois reinicie o Claude Code.

## Uso

- O painel **Escritório** abre sozinho ao iniciar uma sessão; `/escritorio` reabre.
- Abra várias janelas do Claude Code: cada uma vira um bonequinho no mesmo escritório.
- Janelas fechadas somem após ~10s sem sinal.

## Como funciona

Cada janela grava sua mesa no armazenamento compartilhado do Claude Code (`$.store`) com um
sinal de vida a cada 2s, e todas leem as mesas umas das outras.
