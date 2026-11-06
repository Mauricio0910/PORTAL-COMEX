# COMEX LAB ND2 — Publicação no GitHub + Render

**FACDO · Administração · Comércio Exterior · Simulação acadêmica sem validade legal**

Este repositório contém o **servidor completo** do COMEX LAB ND2 (Python + SQLite), e não apenas a página visual. O GitHub armazena o código; o **Render** executa o servidor Python por HTTPS e um **disco persistente** para salvar os trabalhos.

> **Atenção:** GitHub Pages sozinho NÃO executa Python nem salva os dados. O Render com disco persistente exige **plano pago**. Não escolha serviço gratuito com sistema de arquivos temporário: entregas podem ser perdidas ao reiniciar.

## Como colocar no ar (sem programação)

1. Crie uma conta em [GitHub](https://github.com) e em [Render](https://dashboard.render.com).
2. No GitHub, clique em **New repository**, nome sugerido `comex-lab-nd2`. Escolha **Private** (recomendado). Crie o repositório.
3. Extraia o ZIP recebido. No repositório, clique **Add file > Upload files** e envie **os arquivos extraídos** da pasta `COMEX_LAB_ND2_GitHub_Render`, mantendo `render.yaml`, `app.py`, `index.html`, `app.js`, `style.css` e `schema.json` na **raiz**. Não envie o ZIP fechado.
4. No Render, escolha **New > Blueprint**, conecte sua conta GitHub e selecione o repositório. O Render encontrará o arquivo `render.yaml`.
5. Durante a criação, informe `COMEX_ADMIN_EMAIL` (seu e-mail) e `COMEX_ADMIN_PASSWORD` (senha longa, exclusiva, mínimo 10 caracteres). **Nunca escreva sua senha em arquivos do GitHub.** Confira o custo antes de confirmar.
6. Confirme a criação do serviço e aguarde o status **Live**. O Render apresentará uma URL HTTPS semelhante a `https://comex-lab-nd2.onrender.com` (a URL exata é fornecida pela plataforma).
7. Abra a URL e entre com o e-mail e a senha do professor. Crie a **Equipe 01**, **Equipe 02** etc. Copie o código de convite de cada equipe.
8. Compartilhe **a URL pública** com a turma, e **cada código somente com os seis estudantes da respectiva equipe**. Eles escolhem Trio A (Importação) ou Trio B (Exportação).

## Teste obrigatório antes de divulgar à turma

- [ ] Página abre com estilo visual em HTTPS.
- [ ] Professor consegue entrar e criar uma equipe de teste.
- [ ] Um estudante de teste cadastra-se com código de convite.
- [ ] O estudante salva um formulário, sai, entra novamente e encontra o conteúdo.
- [ ] Professor visualiza o progresso da equipe.
- [ ] Faça um redeploy controlado e confira que o formulário continua salvo: isso verifica o disco persistente.
- [ ] Exporte um dossiê JSON para backup. Remova contas/dados de teste antes da atividade real.

## O que o portal oferece

- Contas individuais dos estudantes e professor; 3 alunos por trio, 6 por equipe.
- 28 formulários acadêmicos (G01–G06, I01–I11, E01–E11).
- Salvamento no banco de dados, auditoria básica e protocolo de entrega.
- Correção com rubrica ND2, nota e devolutiva.
- Exportação JSON do dossiê e impressão em PDF pelo navegador.

**Não faz:** registros reais no Siscomex, emissão fiscal oficial, upload de anexos Word/PDF, envio automático de e-mails, armazenamento de respostas no próprio GitHub.

## Segurança e proteção de dados

- Recomenda-se **repositório privado** e acesso ao portal exclusivamente com contas.
- **Nunca** publique o banco `.sqlite3`, senhas, arquivos `.env`, códigos de convite ou trabalhos dos alunos no GitHub.
- Use e-mail e senha exclusivos para o professor. O servidor gera a conta inicial na primeira execução; alterar as variáveis depois não redefine automaticamente a senha já cadastrada.
- O Render deve manter HTTPS, disco persistente e cópias de segurança periódicas. A exportação JSON por equipe é uma medida adicional, **não substitui** um backup íntegro do banco de dados.
- Defina prazos de retenção, base legal e responsáveis pelo tratamento de dados pessoais conforme a LGPD e a política da FACDO.
- Antes do uso em produção, faça os testes indicados acima e, idealmente, solicite uma revisão de segurança pela TI.

## Arquivos técnicos

- `app.py`: API, autenticação, gestão de equipes, formulários e notas.
- `index.html`, `style.css`, `app.js`: interface.
- `schema.json`: 28 módulos e campos.
- `render.yaml`: serviço Python nativo do Render, disco persistente e credenciais inseridas no painel.
- `.gitignore`: impede versionar dados e segredos por engano.

## Referências oficiais

- Render Blueprints: https://render.com/docs/blueprint-spec
- Render Persistent Disks: https://render.com/docs/disks
- GitHub — adicionar arquivos: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

**Importante:** o portal não foi publicado por este pacote. É necessário conectar suas contas GitHub e Render e concluir a criação do serviço.
