import * as THREE from "three"
import { Dimensions, Size } from "./types/types"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import GUI from "lil-gui"
import Planes from "./planes"
import SplatViewer from "./splatViewer"

export default class Canvas {
  element: HTMLCanvasElement
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sizes: Size
  dimensions: Dimensions
  time: number
  clock: THREE.Clock
  raycaster: THREE.Raycaster = new THREE.Raycaster()
  mouse: THREE.Vector2 = new THREE.Vector2()
  orbitControls: OrbitControls
  debug: GUI
  planes: Planes
  splatViewer: SplatViewer | null = null
  material: THREE.ShaderMaterial
  viewMode: 'photos' | 'splats' = 'photos'
  onPhotoClick?: (photoIndex: number) => void
  isDragging: boolean = false
  dragStartPos: { x: number; y: number } = { x: 0, y: 0 }

  constructor() {
    this.element = document.getElementById("webgl") as HTMLCanvasElement
    this.time = 0
    this.createClock()
    this.createScene()
    this.createCamera()
    this.createRenderer()
    this.setSizes()
    this.addEventListeners()
    this.createDebug()
    this.createPlanes()

    this.debug.hide()

    this.render()
  }

  createScene() {
    this.scene = new THREE.Scene()
  }

  createCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    )
    this.scene.add(this.camera)
    this.camera.position.z = 10
  }

  createHelpers() {
    const axesHelper = new THREE.AxesHelper(5)
    this.scene.add(axesHelper)
  }

  createOrbitControls() {
    this.orbitControls = new OrbitControls(
      this.camera,
      this.renderer.domElement
    )
  }

  createPlanes() {
    this.planes = new Planes({ scene: this.scene, sizes: this.sizes })
    // Bind drag interactions to the renderer's canvas
    this.planes.bindDrag(this.renderer.domElement)
  }

  /**
   * Initialize splat viewer (call when splats are ready)
   */
  initSplatViewer() {
    if (this.splatViewer) return

    this.splatViewer = new SplatViewer()
    console.log('[Canvas] Splat viewer initialized')
  }

  /**
   * Add a splat to the viewer
   */
  addSplat(id: string, plyUrl: string) {
    if (!this.splatViewer) {
      this.initSplatViewer()
    }
    this.splatViewer!.addSplat(id, plyUrl)
  }

  /**
   * Switch to splat view mode
   */
  switchToSplats() {
    if (!this.splatViewer || this.splatViewer.getSplatCount() === 0) {
      console.warn('[Canvas] No splats to display')
      return
    }

    this.viewMode = 'splats'
    // Hide photo planes
    if (this.planes?.mesh) {
      this.planes.mesh.visible = false
    }
    console.log('[Canvas] Switched to splat view')
  }

  /**
   * Switch to photo view mode
   */
  switchToPhotos() {
    this.viewMode = 'photos'
    // Show photo planes
    if (this.planes?.mesh) {
      this.planes.mesh.visible = true
    }
    console.log('[Canvas] Switched to photo view')
  }

  /**
   * Toggle between photo and splat views
   */
  toggleViewMode() {
    if (this.viewMode === 'photos') {
      this.switchToSplats()
    } else {
      this.switchToPhotos()
    }
  }

  createRenderer() {
    this.dimensions = {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: Math.min(2, window.devicePixelRatio),
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.element,
      alpha: false,
    })
    this.renderer.setClearColor(0xffffff, 1)  // White background
    this.renderer.setSize(this.dimensions.width, this.dimensions.height)
    this.renderer.render(this.scene, this.camera)

    this.renderer.setPixelRatio(this.dimensions.pixelRatio)
  }

  createDebug() {
    this.debug = new GUI()
  }

  setSizes() {
    let fov = this.camera.fov * (Math.PI / 180)
    let height = this.camera.position.z * Math.tan(fov / 2) * 2
    let width = height * this.camera.aspect

    this.sizes = {
      width: width,
      height: height,
    }
  }

  createClock() {
    this.clock = new THREE.Clock()
  }

  onMouseMove(event: MouseEvent) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  }

  addEventListeners() {
    window.addEventListener("mousemove", this.onMouseMove.bind(this))
    window.addEventListener("resize", this.onResize.bind(this))

    // Click detection (distinguish from drag)
    this.element.addEventListener("pointerdown", this.onPointerDown.bind(this))
    this.element.addEventListener("pointerup", this.onPointerUp.bind(this))
  }

  onPointerDown(event: PointerEvent) {
    this.isDragging = false
    this.dragStartPos = { x: event.clientX, y: event.clientY }
  }

  onPointerUp(event: PointerEvent) {
    // Only treat as click if pointer didn't move much (not a drag)
    const dx = event.clientX - this.dragStartPos.x
    const dy = event.clientY - this.dragStartPos.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 10) {
      this.onClick(event)
    }
  }

  onClick(event: PointerEvent) {
    // Update mouse coordinates for raycaster
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    // Raycast
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObject(this.planes.mesh)

    if (intersects.length > 0) {
      const instanceId = intersects[0].instanceId
      if (instanceId !== undefined) {
        const photoIndex = this.planes.getPhotoIndexFromInstance(instanceId)
        console.log(`[Canvas] Clicked photo index: ${photoIndex}`)

        if (this.onPhotoClick && photoIndex >= 0) {
          this.onPhotoClick(photoIndex)
        }
      }
    }
  }

  onResize() {
    this.dimensions = {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: Math.min(2, window.devicePixelRatio),
    }

    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.setSizes()

    this.renderer.setPixelRatio(this.dimensions.pixelRatio)
    this.renderer.setSize(this.dimensions.width, this.dimensions.height)
  }

  render() {
    const now = this.clock.getElapsedTime()
    const delta = now - this.time
    this.time = now

    const normalizedDelta = delta / (1 / 60)

    // Update planes physics and render
    this.planes?.render(normalizedDelta)

    // Render the scene
    this.renderer.render(this.scene, this.camera)
  }
}
