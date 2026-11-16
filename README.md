# Hidrata

Rastreador diário de água, creatina e vitamina D. É um aplicativo web progressivo (PWA): abre no navegador e pode ser instalado na tela de início do celular. A interface está em português.

Os registros ficam só neste aparelho, no `localStorage` do navegador. Não há conta nem servidor.

## Como rodar no computador

É preciso Python 3. Na pasta do projeto:

```bash
python3 serve.py
```

Abra [http://localhost:8080](http://localhost:8080). Para usar outra porta: `PORT=9000 python3 serve.py`.

Abra por esse endereço, e não clicando duas vezes no `index.html`. O service worker e o manifesto, que permitem instalar o app e receber notificações, só funcionam em `http` ou `https`.

Na primeira abertura o Hidrata pede a meta diária. O campo já vem com **2.000 ml (2 litros)**. Dá para mudar depois em **Ajustes**.

## Como usar

- Toque em **+100 ml**, **+250 ml** ou **+500 ml**, ou informe outra quantidade.
- **Desfazer último** remove só o gole mais recente de hoje.
- A garrafa enche na proporção do que você já bebeu em relação à meta. O total do dia aparece em cima dela.
- Marque **Tomei creatina** e **Tomei vitamina D** quando tomar.
- À meia-noite, no fuso do celular, o dia zera sozinho. Creatina, vitamina D e a água voltam a zero. Os dias anteriores ficam em **Histórico** (até 90 dias).
- A meta usada em cada dia fica gravada naquele dia. Mudar a meta hoje não reescreve o histórico.

## Instalar no celular

O celular precisa abrir o app pelo endereço do computador (ou de onde ele estiver hospedado). `localhost` no celular aponta para o próprio celular, então use o IP do computador na mesma rede Wi-Fi, por exemplo `http://192.168.0.10:8080`.

### Android (Chrome)

1. Abra o endereço no Chrome.
2. No menu (⋮), toque em **Instalar app** ou **Adicionar à tela inicial**.
3. Confirme. O ícone do Hidrata abre em tela cheia.

Se o navegador oferecer, o botão **Instalar aplicativo** também aparece em **Ajustes**.

### iPhone (Safari)

No iOS, a instalação é pelo Safari. Outros navegadores não instalam o PWA de verdade.

1. Abra o endereço no Safari.
2. Toque em **Compartilhar**.
3. Toque em **Adicionar à Tela de Início**.
4. Abra pelo ícone.

## Lembretes

Em **Ajustes** dá para ligar ou desligar cada lembrete e escolher os horários. A água aceita vários horários (o padrão é 09:00, 12:00, 15:00 e 18:00). Creatina e vitamina D têm um horário cada (08:00 e 10:00). Toque em **Ativar notificações** e, se quiser, em **Testar notificação**.

O Hidrata usa a Notifications API e um service worker. Não há servidor de push. Isso limita o que o navegador consegue fazer:

- **Com o app aberto** (ou recém-colocado em segundo plano), o aviso sai no horário. Se você voltar em até **90 minutos**, o lembrete atrasado ainda aparece. Cada horário dispara no máximo uma vez por dia.
- **Com o app totalmente fechado**, o horário não é garantido. No Android, o Chrome às vezes acorda o service worker pela sincronização periódica em segundo plano. O intervalo quem escolhe é o navegador — muitas vezes são várias horas, não o minuto marcado. Se esse despertar cair até 3 horas depois do horário, o Hidrata ainda mostra o lembrete; se for mais tarde, não manda um aviso velho no meio da noite.
- A API experimental que agendaria a notificação mesmo com o app fechado (Notification Triggers / `TimestampTrigger`) **não vem ligada** nos navegadores atuais. Se o navegador oferecer, o Hidrata usa.
- **No iPhone**, notificação web só existe para app instalado na Tela de Início, a partir do iOS 16.4, e a Apple entrega aviso vindo de um servidor push. Sem servidor, o lembrete no iOS depende de o Hidrata estar aberto perto da hora.

Por isso os lembretes são uma ajuda enquanto o app está por perto, não um alarme do sistema.

## Funciona sem internet?

Depois da primeira carga, o service worker guarda as telas. Dá para abrir e registrar o dia offline. Notificações com o app fechado continuam dependendo do navegador, com ou sem rede.

## Desenvolvimento

A lógica de dia, meta, histórico e lembretes está em `js/logic.js`, sem DOM. Para rodar os testes:

```bash
node --test tests/logic.test.mjs
```
