import {newCamera, RADIAN_HALF} from "./framework.js";
import {stopLoop} from "./util.js";
import {Quaternion, Vector3, Box3, Box3Helper} from "three";

export function setQuaternion(mathX, mathY) {
  const qx = new Quaternion();
  qx.setFromAxisAngle(
    new Vector3(0, 1, 0),
    mathX,
  );
  const qz = new Quaternion();
  qz.setFromAxisAngle(
    new Vector3(1, 0, 0),
    mathY,
  );
  
  return {qx, qz};
}

var current_qx = 0;

export function updateCamera(cam, mathX, mathY) {
  const {qx, qz} = setQuaternion(mathX, mathY);
  current_qx = qx._y;
  const q = new Quaternion();
  
  q.multiply(qx);
  q.multiply(qz);
  cam.quaternion.copy(q);
}

export class ControlCamera {
  rx = RADIAN_HALF;
  ry = -RADIAN_HALF;
  canPan = false;
  
  constructor(o) {
    this.camera = newCamera(o);
    this.loop();
    return this;
  }
  
  loop() {
    updateCamera(this.camera, this.rx, this.ry);
    requestAnimationFrame(() => this.loop());
  }
  
  bind(el) {
    if(!el) return console.error(
      new Error("Binding element is undefined")
    );
    this.el = el;
    return this;
  }
  
  touch = {
    down: false,
    id: null,
    lx: 0,
    ly: 0,
    x: 0,
    y: 0,
  };
  
  onPointerMove = () => {};
  
  down(e) {
    if(!this.touch.down) {
      this.touch.down = true;
      this.touch.id = e.pointerId;
      this.touch.lx = e.pageX;
      this.touch.ly = e.pageY;
    }
  }
  
  move(e) {
    if(e.identifier == this.touch.id) {
      this.touch.x = this.touch.lx - e.pageX;
      this.touch.y = this.touch.ly - e.pageY;
      this.touch.lx = e.pageX;
      this.touch.ly = e.pageY;
      
      const sx = -this.touch.x * 0.005;
      const sy = this.touch.y * 0.005;
      
      this.onPointerMove({
        x: this.touch.x,
        y: this.touch.y,
      });
    }
  }
  
  up(e) {
    if(this.touch.down) {
      this.touch.down = false;
      this.touch.id = null;
    }
  }
  
  enable() {
    this.canPan = true;
    this.el
    .addEventListener("pointerdown", e => this.down(e));
    
    // Use targetTouches instead of
    // regular touches or else it glitches
    this.el.addEventListener("touchmove", 
      e => this.move(
        e.targetTouches[e.targetTouches.length-1]
      ),
    );
    
    this.el
    .addEventListener("mousemove", e => this.down(e));
    
    this.el
    .addEventListener("pointerup", e => this.up(e));
    
    return this;
  }
  
  setDefault(x, y) {
    updateCamera(this.camera, x, y);
    this.rx = x;
    this.ry = y;
    return this;
  }
  
  disable() {
    this.canPan = false;
    return this;
  }
}

export class MovementCamera extends ControlCamera {
  direction = new Vector3();
  canMove = true;
  constructor(o) {
    super(o);
  }
  
  onMove = function() {};
  preMove = function(s) {return s}
  
  rawMoveUp(s = 0.05) {
    s = this.preMove(s);
    const cameraDirection = new Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
  
    const delta = cameraDirection.multiplyScalar(s);
    this.camera.position.add(delta);
    this.onMove();
  }
  
  moveUp(s = 0.05) {
    s = this.preMove(s);
    const cameraDirection = new Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0; // Disregard y-axis
    cameraDirection.normalize(); // THIS IS IMPORTANT
  
    const delta = cameraDirection.multiplyScalar(s);
    this.camera.position.add(delta);
    this.onMove();
  }
  
  moveLeft(s = 0.05) {
    s = this.preMove(s);
    this.camera.translateX(-s);
    this.onMove();
  }
  
  moveDown(s = 0.05) {
    this.moveUp(-s);
  }
  
  moveRight(s = 0.05) {
    s = this.preMove(s);
    this.camera.translateX(s);
    this.onMove();
  }
  
  moveAbove(s = 0.04) {
    s = this.preMove(s);
    this.camera.position.y += s;
    this.onMove();
  }
  
  moveBelow(s = 0.04) {
    this.moveAbove(-s);
  }
}

export class PhysicsCamera extends MovementCamera {
  constructor(o) {
    super(o);
  }
  
  gravityEnabled = false;
  gravityInertia = 0;
  totalGravity = 0;
  _getGravityInertia() {
    var g = this.gravityInertia;
    if(g < 0.01) {
      g += 0.001;
    } else if(g < 0.08) {
      g += 0.005;
    }
    
    this.gravityInertia = g;
  }
  
  _gravityLoop = stopLoop(() => {
    this._getGravityInertia();
    this.totalGravity = 0.01 + this.gravityInertia;
    
    this.playerObj.position.y -= this.totalGravity;
    if(this.collided()) {
      this.playerObj.position.y += this.totalGravity;
      this.gravityInertia = 0;
    } else {
      super.moveBelow(this.totalGravity);
    }
  }, false);
  
  bindPhysics({tree, blocks}) {
    this.octree = tree;
    this.blockList = blocks;
    return this;
  }
  
  bindPlayer(obj) {
    this.playerObj = obj;
    return this;
  }
  
  collided() {
    const col = this.octree.get(this.playerObj);
    if(col.length != 0) return true;
    return false;
  }
  
  moveUp(s = 0.05) {
    super.moveUp(s);
    if(this.collided()) super.moveDown(s);
  }
  
  moveLeft(s = 0.05) {
    super.moveLeft(s);
    if(this.collided()) super.moveRight(s);
  }
  
  moveDown(s = 0.05) {
    super.moveDown(s);
    if(this.collided()) super.moveAbove(s);
  }
  
  moveRight(s = 0.05) {
    super.moveRight(s);
    if(this.collided()) super.moveLeft(s);
  }
  
  moveAbove(s = 0.04) {
    super.moveAbove(s);
    if(this.collided()) super.moveBelow(s);
  }
  
  moveBelow(s = 0.04) {
    super.moveBelow(s);
    if(this.collided()) super.moveAbove(s);
  }
  
  enableGravity() {
    this.gravityEnabled = true;
    this._gravityLoop.start();
  }
  
  _jumpInertia = 0.25;
  _jumpLoop = stopLoop(({stop}) => {
    this.moveAbove(this._jumpInertia);
    if(this._jumpInertia >= 0) {
      this._jumpInertia -= 0.02;
    } else {
      this._jumpInertia = 0.25;
      stop();
    }
  }, false);
  
  jump() {
    this.playerObj.position.y -= 0.5;
    if(this.collided()) {
      this.gravityInertia = 0;
      this._jumpLoop.start();
    }
    this.playerObj.position.y += 0.5;
  }
}