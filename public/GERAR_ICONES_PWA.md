# Como Gerar Ícones PWA Quadrados da Logo

Sua logo atual tem **1536x1024** (formato retangular 3:2). Para PWA funcionar corretamente, especialmente no iOS, os ícones precisam ser **quadrados**.

## Opção 1: Usar Ferramenta Online (Mais Rápido)

1. Acesse: https://realfavicongenerator.net/ ou https://www.pwabuilder.com/imageGenerator
2. Faça upload da sua logo `logo.png` (1536x1024)
3. Configure:
   - **Padding**: Adicione padding ao redor da logo para centralizá-la
   - **Tamanho**: Gere ícones de 192x192, 512x512, etc.
   - **Formato**: PNG
4. Baixe os ícones gerados
5. Substitua o `logo.png` na pasta `public/` por uma versão quadrada (ex: 512x512 com logo centralizada)

## Opção 2: Usar Photoshop/GIMP/Canva

1. Abra sua logo (1536x1024)
2. Crie um novo documento **quadrado** (ex: 1536x1536 ou 512x512)
3. Centralize a logo verticalmente
4. Adicione padding nas laterais (esquerda/direita) para manter proporção
5. Exporte como PNG quadrado
6. Substitua `public/logo.png` pela nova versão quadrada

## Opção 3: Usar Script Python (Automático)

Crie um arquivo `generate_icons.py`:

```python
from PIL import Image

# Abrir logo original
logo = Image.open('logo.png')  # 1536x1024

# Criar canvas quadrado (usar a altura como base)
size = max(logo.size)  # 1536
square = Image.new('RGBA', (size, size), (0, 0, 0, 0))

# Calcular posição para centralizar verticalmente
y_offset = (size - logo.size[1]) // 2  # Centralizar verticalmente
x_offset = (size - logo.size[0]) // 2  # Centralizar horizontalmente

# Colar logo no centro
square.paste(logo, (x_offset, y_offset), logo if logo.mode == 'RGBA' else None)

# Salvar versão quadrada
square.save('logo-square.png')
print(f"Ícone quadrado criado: {size}x{size}")
```

Execute: `python generate_icons.py`

## Tamanhos Recomendados

Após criar a versão quadrada, você pode redimensionar para:
- **192x192** - Ícone padrão Android
- **512x512** - Ícone grande Android/iOS
- **180x180** - Apple Touch Icon (iOS)
- **1024x1024** - Tamanho original para manter qualidade

## Após Gerar

1. Substitua `public/logo.png` pela versão quadrada
2. Faça commit e deploy
3. **Desinstale e reinstale** o app no iOS para ver a logo completa
