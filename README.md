# COMEX LAB ND2 — Portal de Entregas por Equipe

**FACDO · Administração · Comércio Exterior · Projeto Final ND2**

Portal acadêmico **funcional**, com banco de dados SQLite e servidor Python. Ele transforma o simulador local anterior em um ambiente com **contas individuais**, **equipes independentes**, **dois trios por equipe**, **28 formulários compartilhados por equipe**, **protocolo de entrega**, **bloqueio após envio**, **auditoria** e **painel de avaliação do professor**.

> **ATENÇÃO:** Este pacote **não está hospedado na internet**. Para que alunos acessem de suas casas, instale-o em uma hospedagem com domínio e HTTPS. O pacote não se conecta ao Siscomex e **não** emite documentos oficiais.

## ATENÇÃO — correção da tela sem formatação (versão 1.1)

Se a página aparecer apenas com texto preto em fundo branco, provavelmente o arquivo `index.html` foi aberto diretamente pelo explorador de arquivos. O HTML **não é o servidor**: não oferece login nem salva respostas.

**Início rápido no Windows:** extraia o ZIP, entre na pasta `COMEX_LAB_ND2_Portal_Online` e execute `INICIAR_PORTAL_WINDOWS.bat`. O script verifica o Python, solicita o cadastro inicial do professor e abre o navegador no endereço `http://127.0.0.1:8080`. Mantenha a janela do servidor aberta durante o uso.

**Mac/Linux:** execute `sh INICIAR_PORTAL_MAC_LINUX.sh` no terminal.

O CSS e o JavaScript foram alterados para caminhos relativos, e a abertura direta do HTML agora exibe um aviso com instruções. Isso **não** transforma o HTML em portal online: para acesso remoto de equipes diferentes é necessária hospedagem HTTPS e banco de dados persistente.

## 1. Iniciar em um computador (Windows, macOS ou Linux)

Requisito: **Python 3.10 ou superior**. Não é necessário instalar bibliotecas extras.

1. Extraia o ZIP.
2. Abra um terminal dentro da pasta `COMEX_LAB_ND2_Portal_Online`.
3. Crie a conta do professor:
   ```
   python app.py create-teacher --email professor@faculdade.edu.br --name "Professor"
   ```
   O sistema solicitará uma senha com **no mínimo 10 caracteres**. **Não use dados reais de estudantes no ambiente de teste.**
4. Inicie o servidor:
   ```
   python app.py serve
   ```
5. Abra no navegador: **http://127.0.0.1:8080**.

No Windows, se `python` não funcionar, tente `py`. Para encerrar, pressione `Ctrl+C`.

### Acesso de alunos de outros computadores

O modo local acima só é acessível no mesmo computador. Para acesso na rede interna da faculdade, use `python app.py serve --host 0.0.0.0 --port 8080`, **somente em rede confiável e com proteção adequada**. Não exponha essa porta diretamente à internet: para uso remoto, publique por **HTTPS** com proxy reverso ou serviço de hospedagem.

## 2. Operação da ND2

**Professor**
1. Entre com seu e-mail e senha.
2. Clique em **Criar equipe**. Sugestão: “Equipe 01”, “Equipe 02” etc.
3. Defina a data da ND2 e compartilhe **somente com os seis estudantes** o código de convite de cada equipe.
4. Acompanhe o número de integrantes, os 28 formulários, as pendências e a situação da entrega.
5. Abra o dossiê de cada equipe, consulte os registros, imprima em PDF e baixe o backup JSON.
6. Após a entrega, avalie pelos seis critérios da rubrica, totalizando 100 pontos.
7. Se necessário, reabra a entrega (isso **apaga a nota anterior**) ou encerre inscrições. É possível redefinir a senha de um estudante e corrigir o cadastro de integrantes.

**Estudantes**
1. Cada um dos **seis estudantes** cria sua própria conta, usando o código de convite.
2. Três selecionam **Trio A — Importação** e três **Trio B — Exportação**.
3. O Trio A preenche I01–I11; o Trio B preenche E01–E11; ambos preenchem G01–G06.
4. Cada formulário pode ser salvo como rascunho ou validado como revisado. Os formulários condicionais admitem dispensa justificada.
5. A equipe confere a auditoria e o dossiê. **Um integrante** clica em **Enviar trabalho final da equipe**.
6. O sistema exige 6 estudantes (3+3) e 28 módulos revisados/dispensados, registra um **protocolo acadêmico** e bloqueia alterações.
7. A nota e a devolutiva ficam disponíveis na área da equipe após a correção.

**Importante:** a entrega é **uma por equipe de seis estudantes**, com contas individuais e atribuições distintas para cada trio. Se você desejar **uma nota por estudante** em vez de nota por equipe, a rubrica e o modelo de avaliação precisarão ser adaptados.

## 3. O que o portal faz — e não faz

| Funcionalidade | Situação |
|---|---|
| Login individual com senha protegida | Implementado |
| Cadastro por convite, com 3 alunos por trio | Implementado |
| Isolamento dos dossiês por equipe | Implementado |
| 28 formulários acadêmicos do projeto original | Implementado |
| Salvamento centralizado e detecção de edição concorrente | Implementado |
| Revisão, dispensa justificada, auditoria de campos | Implementado |
| Protocolo de entrega, bloqueio e reabertura | Implementado |
| Painel do professor, rubrica ND2, devolutiva | Implementado |
| Exportação JSON e impressão em PDF pelo navegador | Implementado |
| Upload de arquivos externos PDF/Word | **Não incluído nesta versão** |
| Conexão real com Siscomex, DU-E, Duimp, NF-e | **Não incluído; simulação didática** |
| Hospedagem pública / domínio da faculdade | **Depende de instalação** |

A auditoria automática é **parcial** e não comprova enquadramento legal, classificação NCM ou cálculo tributário. Os estudantes devem citar fontes oficiais e o professor deve conferir as exigências efetivamente aplicáveis a cada mercadoria.

## 4. Hospedar online com Docker

Arquivos incluídos: `Dockerfile` e `compose.yaml`.

Em uma VPS com Docker e proxy HTTPS:
```
docker compose up -d --build
```
Antes, configure as variáveis `COMEX_ADMIN_EMAIL`, `COMEX_ADMIN_PASSWORD`, `COMEX_ADMIN_NAME` e `COMEX_HTTPS=1`. O contêiner usa o banco de dados em volume persistente (`/data/comex.sqlite3`).

**Não publique a porta 8080 sem HTTPS.** Configure Caddy, Nginx ou serviço equivalente para TLS. Faça backups automáticos do volume. Restrinja o acesso administrativo e obedeça às regras institucionais de proteção de dados (LGPD). Não use CPF, CNPJ real, dados bancários reais ou segredos comerciais no simulador.

### Opção de hospedagem gerenciada

O `Dockerfile` é compatível com provedores que hospedam contêineres. Configure:
- Comando de inicialização: `python app.py serve --host 0.0.0.0 --port ${PORT:-8080}` (o Dockerfile já possui comando padrão).
- Disco/volume **persistente** montado em `/data`.
- `COMEX_DB=/data/comex.sqlite3`
- `COMEX_HTTPS=1` quando o site for servido por HTTPS.
- `COMEX_ADMIN_EMAIL` e `COMEX_ADMIN_PASSWORD` como **segredos**, para criar o primeiro professor (remova o segredo da senha inicial após o primeiro uso e altere a senha no portal).

**Não utilize planos de hospedagem com disco efêmero**, pois a perda do contêiner apagará as respostas.

## 5. Segurança, privacidade e backup

- Senhas: PBKDF2-HMAC-SHA256 com salt e 310 mil iterações.
- Sessões: cookies HttpOnly, SameSite=Lax, token aleatório, duração de 8 horas.
- Requisições de alteração: token CSRF; validação de origem e de permissões no servidor.
- Equipes não acessam registros de outras equipes.
- Não há integração com sistemas fiscais, aduaneiros ou financeiros.
- O sistema **não envia e-mails automaticamente**; códigos e senhas temporárias são repassados pelo professor.
- **Backup**: copie o arquivo `comex_lab.sqlite3` com o servidor parado ou faça backup SQLite consistente; no Docker, proteja o volume `comex-data`.
- Dados acadêmicos: mantenha política de retenção, consentimento/informação aos alunos e controle de acesso.
- Para uso institucional em produção, recomenda-se auditoria de segurança e política de backup/restauração pela TI.

## 6. Rubrica de 100 pontos

| Critério | Máximo |
|---|---:|
| Empresa e estratégia internacional | 10 |
| NCM e conformidade | 15 |
| Documentação de importação | 20 |
| Documentação de exportação | 20 |
| Finanças, câmbio e riscos | 20 |
| Integração e defesa oral | 15 |
| **Total** | **100** |

## 7. Estrutura dos arquivos

- `app.py` — servidor, autenticação, banco de dados e APIs.
- `index.html`, `app.js`, `style.css` — interface do estudante e do professor.
- `schema.json` — definição dos 28 formulários originais.
- `Dockerfile`, `compose.yaml` — hospedagem em contêiner.
- `README.md` — este manual.

**Versão:** 1.0 — 5 de novembro de 2026.  
**Finalidade:** avaliação ND2 de Comércio Exterior, uso didático.
