export class DevMenu {
  constructor(game) {
    this.game = game;
    this.isVisible = false;
    this.createUI();
    this.setupKeyboardShortcut();
  }

  createUI() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'dev-menu';
    this.container.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      min-width: 280px;
      display: none;
      max-height: 80vh;
      overflow-y: auto;
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = 'Post-Processing Effects';
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #444;
      color: #ff6600;
    `;
    this.container.appendChild(title);

    // Hint
    const hint = document.createElement('div');
    hint.textContent = 'Press ~ to toggle menu';
    hint.style.cssText = `
      font-size: 10px;
      color: #888;
      margin-bottom: 15px;
    `;
    this.container.appendChild(hint);

    // Effects section
    this.effectsContainer = document.createElement('div');
    this.container.appendChild(this.effectsContainer);

    document.body.appendChild(this.container);
  }

  setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      // Toggle with ~ key
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle() {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
  }

  addEffect(config) {
    const effectDiv = document.createElement('div');
    effectDiv.style.cssText = `
      margin-bottom: 15px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    `;

    // Header with checkbox and collapse arrow
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    `;

    // Collapse arrow
    const collapseArrow = document.createElement('span');
    collapseArrow.textContent = '▼';
    collapseArrow.style.cssText = `
      font-size: 14px;
      margin-right: 10px;
      cursor: pointer;
      transition: transform 0.2s;
      color: #888;
      user-select: none;
      width: 20px;
      display: inline-block;
      text-align: center;
    `;

    // Checkbox for enabling/disabling effect
    const checkboxContainer = document.createElement('label');
    checkboxContainer.style.cssText = `
      display: flex;
      align-items: center;
      cursor: pointer;
      flex: 1;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = config.enabled || false;
    checkbox.style.cssText = `
      margin-right: 8px;
      cursor: pointer;
    `;
    checkbox.addEventListener('change', (e) => {
      config.onChange(e.target.checked);
    });

    const label = document.createElement('span');
    label.textContent = config.name;
    label.style.cssText = `
      font-weight: bold;
      color: #ff6600;
    `;

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(label);

    headerDiv.appendChild(collapseArrow);
    headerDiv.appendChild(checkboxContainer);
    effectDiv.appendChild(headerDiv);

    // Parameters container
    const parametersDiv = document.createElement('div');
    parametersDiv.style.cssText = `
      margin-left: 24px;
      display: block;
      overflow: hidden;
      transition: max-height 0.3s ease;
      max-height: 500px;
    `;

    let isCollapsed = false;

    // Collapse toggle
    collapseArrow.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        collapseArrow.style.transform = 'rotate(-90deg)';
        parametersDiv.style.maxHeight = '0';
      } else {
        collapseArrow.style.transform = 'rotate(0deg)';
        parametersDiv.style.maxHeight = '500px';
      }
    });

    // Add parameter controls
    if (config.parameters) {
      config.parameters.forEach(param => {
        const paramDiv = document.createElement('div');
        paramDiv.style.marginBottom = '8px';

        const paramLabel = document.createElement('div');
        paramLabel.textContent = `${param.name}: ${param.value.toFixed(2)}`;
        paramLabel.style.cssText = `
          font-size: 11px;
          margin-bottom: 4px;
          color: #ccc;
        `;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = param.min;
        slider.max = param.max;
        slider.step = param.step || 0.01;
        slider.value = param.value;
        slider.style.cssText = `
          width: 100%;
          cursor: pointer;
        `;

        slider.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          paramLabel.textContent = `${param.name}: ${value.toFixed(2)}`;
          param.onChange(value);
        });

        paramDiv.appendChild(paramLabel);
        paramDiv.appendChild(slider);
        parametersDiv.appendChild(paramDiv);
      });
    }

    effectDiv.appendChild(parametersDiv);
    this.effectsContainer.appendChild(effectDiv);
  }
}
