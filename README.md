# KickZone Archive · Dez tênis escaneados

Abra o `index.html` para explorar. No desktop, o adidas Crazy 8 abre em destaque. No celular, a página começa na vitrine. Cada card abre o scan em 3D, com rotação por arraste, vistas da lateral, do topo e da sola, e navegação por setas. **Esc** volta à vitrine.

Os arquivos e as imagens de apoio ficam em `assets/scans`. A coleção funciona localmente, inclusive sem internet. O visualizador carrega o modelo escolhido e, no desktop, os vizinhos. A vitrine usa imagens renderizadas dos próprios scans.

Abra **Provador** pelo cabeçalho ou use **Experimentar no avatar** para calçar o modelo em destaque. Escolha um dos cinco looks, personalize o avatar e use **Zoom nos pés** para aproximar o tênis. A configuração fica salva no navegador quando o armazenamento local está disponível.

O avatar usa peças adaptadas dos pacotes [Ultimate Modular Men](https://quaternius.com/packs/ultimatemodularcharacters.html) e [Ultimate Modular Women](https://quaternius.com/packs/ultimatemodularwomen.html), de Quaternius, sob CC0. O provador é visual e usa uma cópia espelhada nos modelos que vieram com um único pé escaneado. A escala é ajustada ao avatar.

## Provador pela câmera

Abra **Ver no meu pé** na ficha do tênis ou **Experimentar com a câmera** no provador. Toque em **Ativar câmera**, dê permissão e enquadre um pé inteiro e parte da perna. No celular, o navegador dá preferência à câmera traseira. Para experimentar com a câmera bem perto, use **Marcar pé**, escolha o lado e toque no calcanhar e na ponta do pé. Aponte de cima, com boa luz, e mova o celular devagar. Se o pé sair do quadro, use **Remarcar pé**. Você pode trocar de modelo com a câmera ligada.

Use HTTPS no celular. No computador, sirva a pasta em `http://localhost` para usar também a detecção automática. Quando o navegador permitir câmera em arquivos locais, a marcação manual pode funcionar direto no `index.html`. O detector [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) e seu runtime ficam em `assets/pose`, sob Apache 2.0. Os quadros da câmera são processados no dispositivo. A câmera é desligada ao fechar o provador ou sair da aba. O encaixe é uma prévia visual, com escala e orientação estimadas.

## Fontes dos scans

O catálogo usa scans publicados por terceiros sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). A escala e a orientação foram ajustadas para a vitrine. As malhas e texturas foram otimizadas para o navegador, e o suporte do scan do Air Force 1 foi recortado. As capturas podem apresentar marcas e lacunas dos originais.

- **adidas Crazy 8** — [Google Research](https://fuel.gazebosim.org/1.0/GoogleResearch/models/Crazy_8).
- **Nike Air Force 1** — [Bogdan Georgescu](https://sketchfab.com/3d-models/nike-air-force-1-scan-ba0357f63aa64cb29745f25a4863cac7).
- **Converse Chuck Taylor All Star** — [Yaroslav Karas](https://sketchfab.com/3d-models/converse-free-bc791439d26f4dd9974819c168e12385).
- **adidas Yeezy Boost 350 V2** — [veryveig](https://sketchfab.com/3d-models/adidas-yeezy-boost-350-v2-zyon-8b69acdf36e048ae8072e20ed5e4c5eb).
- **Nike React Presto** — [FletchTech](https://sketchfab.com/3d-models/nike-react-presto-running-shoes-c9b878b60d524413becd63dae298b027).
- **adidas Stan Smith** — [Mario Rocha](https://sketchfab.com/3d-models/day-21-adidas-stan-smith-86e68bc3f04c4b72b2ef0bb6369e3b66).
- **Nike Air Presto × Off-White** — [dorusvandenoord](https://sketchfab.com/3d-models/nike-air-presto-x-off-white-black-7bffa20a02bb4be19832570cf7fabccb).
- **adidas × Jeremy Scott JS Wings 2.0** — [Google Research](https://fuel.gazebosim.org/1.0/GoogleResearch/models/JS_WINGS_20_BLACK_FLAG).
- **Nike SB SB Charge CNVS** — [wolkoed](https://sketchfab.com/3d-models/nike-sb-charge-cnvs-46261bacdcbe4f2381edd5d1afc8df91).
- **adidas D Rose 4.5** — [Google Research](https://fuel.gazebosim.org/1.0/GoogleResearch/models/D_ROSE_45).

Os scans do Google Research vieram de [Google Scanned Objects](https://arxiv.org/abs/2204.11918), na [conversão para GLB do codepawl](https://huggingface.co/datasets/codepawl/scanned-objects-glb). Os demais arquivos foram obtidos no [Objaverse da Ai2](https://objaverse.allenai.org/docs/objaverse-1.0/).

## Código

- `src/collection.mjs` guarda nomes, orientação e créditos.
- `src/scan-model.mjs` abre os arquivos e encaixa cada modelo na prateleira.
- `src/scene.mjs` contém câmera, iluminação e transições.
- `src/showroom.mjs` controla a vitrine e a navegação.

```sh
npm install
npm run check
npm run build
```

Three.js usa a licença MIT. Space Grotesk usa a SIL Open Font License. Os textos das licenças estão em `assets`.

