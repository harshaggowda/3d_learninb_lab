import GUI from 'lil-gui';
import { AxesHelper, BoxHelper, Matrix4, Mesh } from 'three';
import { Scene } from './scene';
import { compose, makeRotationX, makeRotationY, makeRotationZ,
         makeScale, makeShear, makeTranslation, TransformType } from './math/matrices';
import { AppState, TransformOrder, TransformParams } from './state/store';
import * as primitives from './objects/primitives';


export class UI {
  private gui: GUI;
  private state: AppState;
  private scene: Scene;
  private matrixPanel!: HTMLPreElement; // Using definite assignment assertion
  private localAxesHelper: AxesHelper | null = null;
  private boxHelper: BoxHelper | null = null;

  constructor(state: AppState, scene: Scene) {
    this.state = state;
    this.scene = scene;
    this.gui = new GUI();
    this.setupMatrixPanel(); // Move this before setupGUI
    this.setupGUI();
    this.updateObjectHelpers();
    this.updateTransform();
  }

  private setupGUI(): void {
    // Primitive Shape selection
    const shapeFolder = this.gui.addFolder('Primitive Shape');
    shapeFolder.add(this.state, 'shape', ['Cube', 'Sphere', 'Cylinder', 'Torus', 'Plane'])
      .name('Geometry')
      .onChange(() => this.changeShape());

    // Transform parameters
    const transformFolder = this.gui.addFolder('Transform Parameters');
    
    // Translation
    const translationFolder = transformFolder.addFolder('Translation');
    translationFolder.add(this.state.transform, 'tx', -5, 5, 0.1)
      .onChange(() => this.updateTransform());
    translationFolder.add(this.state.transform, 'ty', -5, 5, 0.1)
      .onChange(() => this.updateTransform());
    translationFolder.add(this.state.transform, 'tz', -5, 5, 0.1)
      .onChange(() => this.updateTransform());

    // Rotation
    const rotationFolder = transformFolder.addFolder('Rotation (degrees)');
    rotationFolder.add(this.state.transform, 'rx', -180, 180, 1)
      .onChange(() => this.updateTransform());
    rotationFolder.add(this.state.transform, 'ry', -180, 180, 1)
      .onChange(() => this.updateTransform());
    rotationFolder.add(this.state.transform, 'rz', -180, 180, 1)
      .onChange(() => this.updateTransform());

    // Scale
    const scaleFolder = transformFolder.addFolder('Scale');
    scaleFolder.add(this.state.transform, 'sx', 0.1, 5, 0.1)
      .onChange(() => this.updateTransform());
    scaleFolder.add(this.state.transform, 'sy', 0.1, 5, 0.1)
      .onChange(() => this.updateTransform());
    scaleFolder.add(this.state.transform, 'sz', 0.1, 5, 0.1)
      .onChange(() => this.updateTransform());

    // Shear
    const shearFolder = transformFolder.addFolder('Shear');
    shearFolder.add(this.state.transform, 'shXY', -1, 1, 0.1)
      .onChange(() => this.updateTransform());
    shearFolder.add(this.state.transform, 'shXZ', -1, 1, 0.1)
      .onChange(() => this.updateTransform());
    shearFolder.add(this.state.transform, 'shYX', -1, 1, 0.1)
      .onChange(() => this.updateTransform());
    shearFolder.add(this.state.transform, 'shYZ', -1, 1, 0.1)
      .onChange(() => this.updateTransform());
    shearFolder.add(this.state.transform, 'shZX', -1, 1, 0.1)
      .onChange(() => this.updateTransform());
    shearFolder.add(this.state.transform, 'shZY', -1, 1, 0.1)
      .onChange(() => this.updateTransform());

    // Transform order
    const orderFolder = this.gui.addFolder('Transform Order');
    orderFolder.add(this.state, 'transformOrder', {
      'Scale → Rotate → Shear → Translate': 'SRST',
      'Translate → Rotate → Scale': 'TRS',
      'Rotate → Translate → Scale': 'RTS',
      'Scale → Translate → Rotate': 'STR',
    }).onChange(() => this.updateTransform());

    // Display options
    const displayFolder = this.gui.addFolder('Display Options');
    displayFolder.add(this.state.display, 'showGrid')
      .onChange((value: boolean) => this.scene.setGridVisible(value));
    displayFolder.add(this.state.display, 'showLocalAxes')
      .onChange(() => this.updateObject());
    displayFolder.add(this.state.display, 'showBoundingBox')
      .onChange(() => this.updateObject());
    displayFolder.add(this.state.display, 'normalizeScale')
      .onChange(() => this.updateTransform());

    // Presets folder
    const presetsFolder = this.gui.addFolder('Transform Presets');
    presetsFolder.add(this, 'applyRotationZPreset').name('Pure Rotation Z (90°)');
    presetsFolder.add(this, 'applyNonUniformScaleRotationPreset')
      .name('Scale + Rotate');
    presetsFolder.add(this, 'applyShearOnlyPreset').name('Pure Shear');
    presetsFolder.add(this, 'applyTranslateRotateContrastPreset')
      .name('Translate vs Rotate');
  }

  private setupMatrixPanel(): void {
    this.matrixPanel = document.createElement('pre');
    this.matrixPanel.style.position = 'fixed';
    this.matrixPanel.style.top = '10px';
    this.matrixPanel.style.right = '10px';
    this.matrixPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    this.matrixPanel.style.color = 'white';
    this.matrixPanel.style.padding = '10px';
    this.matrixPanel.style.fontFamily = 'monospace';
    this.matrixPanel.style.fontSize = '14px';
    document.body.appendChild(this.matrixPanel);
  }

  private updateMatrixDisplay(matrix: Matrix4): void {
    const elements = matrix.elements;
    const precision = 3;
    
    let text = 'Current 4×4 Transform Matrix (column-major):\n\n';
    for (let row = 0; row < 4; row++) {
      text += '│ ';
      for (let col = 0; col < 4; col++) {
        const value = elements[col * 4 + row].toFixed(precision);
        text += value.padStart(8) + ' ';
      }
      text += '│\n';
    }
    
    text += '\nTransform Order: ' + this.getTransformOrderString();
    this.matrixPanel.textContent = text;
  }

  private getTransformOrderString(): string {
    const order = this.state.transformOrder;
    return order.split('').map((char: string) => {
      switch (char) {
        case 'T': return 'Translate';
        case 'R': return 'Rotate';
        case 'S': return 'Scale';
        case 'h': return 'Shear';
        default: return char;
      }
    }).join(' → ');
  }

  private updateTransform(): void {
    const t = this.state.transform;
    const orderMap = this.parseTransformOrder(this.state.transformOrder);
    
    const transforms = {
      T: makeTranslation(t.tx, t.ty, t.tz),
      R: compose(['X', 'Y', 'Z'], {
        X: makeRotationX(t.rx),
        Y: makeRotationY(t.ry),
        Z: makeRotationZ(t.rz)
      }),
      S: makeScale(
        this.state.display.normalizeScale ? t.sx / Math.max(t.sx, t.sy, t.sz) : t.sx,
        this.state.display.normalizeScale ? t.sy / Math.max(t.sx, t.sy, t.sz) : t.sy,
        this.state.display.normalizeScale ? t.sz / Math.max(t.sx, t.sy, t.sz) : t.sz
      ),
      Sh: makeShear(t.shXY, t.shXZ, t.shYX, t.shYZ, t.shZX, t.shZY)
    };
    
    const matrix = compose(orderMap, transforms);
    this.updateMatrixDisplay(matrix);
    
    if (this.state.activeObject) {
      this.state.activeObject.matrix.copy(matrix);
      this.state.activeObject.matrixAutoUpdate = false;
      if (this.boxHelper) {
        this.boxHelper.update();
      }
    }
  }

  private parseTransformOrder(order: TransformOrder): TransformType[] {
    const validChars = new Set(['T', 'R', 'S', 'h', 'X', 'Y', 'Z']);
    return order.split('').map((char: string): TransformType => {
      if (validChars.has(char)) {
        return char as TransformType;
      }
      throw new Error(`Invalid transform type: ${char}`);
    });
  }

  private changeShape(): void {
    if (this.state.activeObject) {
      if (this.localAxesHelper) {
        this.state.activeObject.remove(this.localAxesHelper);
        this.localAxesHelper.dispose();
        this.localAxesHelper = null;
      }
      if (this.boxHelper) {
        this.scene.remove(this.boxHelper);
        this.boxHelper.dispose();
        this.boxHelper = null;
      }
      this.scene.remove(this.state.activeObject);
    }

    let newObject: Mesh;
    switch (this.state.shape) {
      case 'Sphere':
        newObject = primitives.createSphere();
        break;
      case 'Cylinder':
        newObject = primitives.createCylinder();
        break;
      case 'Torus':
        newObject = primitives.createTorus();
        break;
      case 'Plane':
        newObject = primitives.createPlane();
        break;
      case 'Cube':
      default:
        newObject = primitives.createCube();
        break;
    }

    this.scene.add(newObject);
    this.state.activeObject = newObject;
    this.updateObjectHelpers();
    this.updateTransform();
  }

  private updateObjectHelpers(): void {
    if (!this.state.activeObject) return;

    if (!this.localAxesHelper) {
      this.localAxesHelper = new AxesHelper(1.5);
      this.state.activeObject.add(this.localAxesHelper);
    }
    this.localAxesHelper.visible = this.state.display.showLocalAxes;

    if (!this.boxHelper) {
      this.boxHelper = new BoxHelper(this.state.activeObject, 0xffff00);
      this.scene.add(this.boxHelper);
    }
    this.boxHelper.visible = this.state.display.showBoundingBox;
    if (this.boxHelper.visible) {
      this.boxHelper.update();
    }
  }

  private updateObject(): void {
    this.updateObjectHelpers();
  }

  // Preset implementations
  public applyRotationZPreset(): void {
    const preset: Partial<TransformParams> = {
      rx: 0, ry: 0, rz: 90,
      tx: 0, ty: 0, tz: 0,
      sx: 1, sy: 1, sz: 1,
      shXY: 0, shXZ: 0, shYX: 0,
      shYZ: 0, shZX: 0, shZY: 0
    };
    Object.assign(this.state.transform, preset);
    this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    this.updateTransform();
  }

  public applyNonUniformScaleRotationPreset(): void {
    const preset: Partial<TransformParams> = {
      rx: 0, ry: 45, rz: 0,
      tx: 0, ty: 0, tz: 0,
      sx: 2, sy: 1, sz: 1,
      shXY: 0, shXZ: 0, shYX: 0,
      shYZ: 0, shZX: 0, shZY: 0
    };
    Object.assign(this.state.transform, preset);
    this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    this.updateTransform();
  }

  public applyShearOnlyPreset(): void {
    const preset: Partial<TransformParams> = {
      rx: 0, ry: 0, rz: 0,
      tx: 0, ty: 0, tz: 0,
      sx: 1, sy: 1, sz: 1,
      shXY: 0.5, shXZ: 0, shYX: 0,
      shYZ: 0, shZX: 0, shZY: 0
    };
    Object.assign(this.state.transform, preset);
    this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    this.updateTransform();
  }

  public applyTranslateRotateContrastPreset(): void {
    const preset: Partial<TransformParams> = {
      rx: 0, ry: 90, rz: 0,
      tx: 2, ty: 0, tz: 0,
      sx: 1, sy: 1, sz: 1,
      shXY: 0, shXZ: 0, shYX: 0,
      shYZ: 0, shZX: 0, shZY: 0
    };
    Object.assign(this.state.transform, preset);
    this.state.transformOrder = 'TRS';
    this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    this.updateTransform();
  }
}