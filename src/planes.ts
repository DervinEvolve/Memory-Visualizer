import * as THREE from "three"
import vertexShader from "./shaders/vertex.glsl"
import fragmentShader from "./shaders/fragment.glsl"
import { Size } from "./types/types"
import normalizeWheel from "normalize-wheel"
import { getPhotoUrls, getDemoPhotoUrls, Photo } from "./photoService"

interface Props {
  scene: THREE.Scene
  sizes: Size
  onPlaneClick?: (index: number, photo?: Photo) => void
}

interface ImageInfo {
  width: number
  height: number
  aspectRatio: number
  uvs: {
    xStart: number
    xEnd: number
    yStart: number
    yEnd: number
  }
}

export default class Planes {
  scene: THREE.Scene
  geometry: THREE.PlaneGeometry
  material: THREE.ShaderMaterial
  mesh: THREE.InstancedMesh
  meshCount: number = 400
  sizes: Size
  drag: {
    xCurrent: number
    xTarget: number
    yCurrent: number
    yTarget: number
    isDown: boolean
    startX: number
    startY: number
    lastX: number
    lastY: number
  } = {
    xCurrent: 0,
    xTarget: 0,
    yCurrent: 0,
    yTarget: 0,
    isDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  }
  shaderParameters = {
    maxX: 0,
    maxY: 0,
  }
  scrollY: {
    target: number
    current: number
    direction: number
  } = {
    target: 0,
    current: 0,
    direction: 0,
  }
  dragSensitivity: number = 1
  dragDamping: number = 0.1
  dragElement?: HTMLElement
  imageInfos: ImageInfo[] = []
  atlasTexture: THREE.Texture | null = null
  blurryAtlasTexture: THREE.Texture | null = null
  onPlaneClick?: (index: number, photo?: Photo) => void
  photoUrls: string[] = []
  instanceToPhotoIndex: number[] = []  // Maps instanceId → photoIndex

  constructor({ scene, sizes, onPlaneClick }: Props) {
    this.scene = scene
    this.sizes = sizes
    this.onPlaneClick = onPlaneClick

    this.shaderParameters = {
      maxX: this.sizes.width * 2,
      maxY: this.sizes.height * 2,
    }

    this.createGeometry()
    this.createMaterial()
    this.createInstancedMesh()
    this.loadPhotos()

    window.addEventListener("wheel", this.onWheel.bind(this))
  }

  createGeometry() {
    // Square geometry for photos (instead of phone-shaped for Spotify)
    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
    this.geometry.scale(2, 2, 2)
  }

  async loadPhotos() {
    // Try to get user photos, fall back to demo
    let urls = getPhotoUrls()
    if (urls.length === 0) {
      urls = getDemoPhotoUrls()
    }
    this.photoUrls = urls
    await this.loadTextureAtlas(urls)
    this.createBlurryAtlas()
    this.fillMeshData()
  }

  /**
   * Reload photos (called when user adds new photos)
   */
  async reloadPhotos(urls?: string[]) {
    this.photoUrls = urls || getPhotoUrls()
    if (this.photoUrls.length === 0) {
      this.photoUrls = getDemoPhotoUrls()
    }
    await this.loadTextureAtlas(this.photoUrls)
    this.createBlurryAtlas()
    this.fillMeshData()
  }

  async loadTextureAtlas(urls: string[]) {
    if (urls.length === 0) {
      console.warn('[Planes] No URLs to load')
      return
    }

    console.log(`[Planes] Loading ${urls.length} images into atlas`)

    // Load all images
    const imagePromises = urls.map(async (path, index) => {
      return new Promise<CanvasImageSource | null>((resolve) => {
        const img = new Image()
        // Only set crossOrigin for non-blob URLs
        if (!path.startsWith('blob:')) {
          img.crossOrigin = "anonymous"
        }
        img.onload = () => {
          console.log(`[Planes] Loaded image ${index + 1}/${urls.length}: ${img.width}x${img.height}`)
          resolve(img)
        }
        img.onerror = (e) => {
          console.error(`[Planes] Failed to load image ${index}: ${path}`, e)
          resolve(null) // Don't reject, just skip failed images
        }
        img.src = path
      })
    })

    const loadedImages = await Promise.all(imagePromises)
    const images = loadedImages.filter((img): img is CanvasImageSource => img !== null)

    if (images.length === 0) {
      console.error('[Planes] No images loaded successfully')
      return
    }

    console.log(`[Planes] Successfully loaded ${images.length}/${urls.length} images`)

    // Use a grid-based atlas to avoid exceeding canvas size limits
    // Max canvas size in most browsers is 16384px
    const MAX_ATLAS_SIZE = 8192
    const THUMB_SIZE = 512  // Thumbnail size for each image in atlas

    // Calculate grid dimensions
    const cols = Math.ceil(Math.sqrt(images.length))
    const rows = Math.ceil(images.length / cols)

    const atlasWidth = Math.min(cols * THUMB_SIZE, MAX_ATLAS_SIZE)
    const atlasHeight = Math.min(rows * THUMB_SIZE, MAX_ATLAS_SIZE)

    console.log(`[Planes] Creating atlas: ${atlasWidth}x${atlasHeight} (${cols}x${rows} grid)`)

    // Create canvas
    const canvas = document.createElement("canvas")
    canvas.width = atlasWidth
    canvas.height = atlasHeight
    const ctx = canvas.getContext("2d")!

    // Fill with white background (debugging)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, atlasWidth, atlasHeight)

    // Draw images in grid and calculate UVs
    this.imageInfos = images.map((img: any, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)

      const x = col * THUMB_SIZE
      const y = row * THUMB_SIZE

      // Draw image scaled to fit thumbnail
      const imgWidth = img.width as number
      const imgHeight = img.height as number
      const aspectRatio = imgWidth / imgHeight

      let drawWidth = THUMB_SIZE
      let drawHeight = THUMB_SIZE
      let drawX = x
      let drawY = y

      // Maintain aspect ratio (cover mode)
      if (aspectRatio > 1) {
        drawHeight = THUMB_SIZE
        drawWidth = THUMB_SIZE * aspectRatio
        drawX = x - (drawWidth - THUMB_SIZE) / 2
      } else {
        drawWidth = THUMB_SIZE
        drawHeight = THUMB_SIZE / aspectRatio
        drawY = y - (drawHeight - THUMB_SIZE) / 2
      }

      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, THUMB_SIZE, THUMB_SIZE)
      ctx.clip()
      ctx.drawImage(img as any, drawX, drawY, drawWidth, drawHeight)
      ctx.restore()

      return {
        width: imgWidth,
        height: imgHeight,
        aspectRatio,
        uvs: {
          xStart: x / atlasWidth,
          xEnd: (x + THUMB_SIZE) / atlasWidth,
          yStart: 1 - y / atlasHeight,
          yEnd: 1 - (y + THUMB_SIZE) / atlasHeight,
        },
      }
    })

    console.log(`[Planes] Atlas created with ${this.imageInfos.length} images`)

    // Create texture
    this.atlasTexture = new THREE.Texture(canvas)
    this.atlasTexture.wrapS = THREE.ClampToEdgeWrapping
    this.atlasTexture.wrapT = THREE.ClampToEdgeWrapping
    this.atlasTexture.minFilter = THREE.LinearFilter
    this.atlasTexture.magFilter = THREE.LinearFilter
    this.atlasTexture.needsUpdate = true
    this.material.uniforms.uAtlas.value = this.atlasTexture
  }

  createBlurryAtlas() {
    if (!this.atlasTexture || !this.atlasTexture.image) return

    try {
      const blurryCanvas = document.createElement("canvas")
      blurryCanvas.width = this.atlasTexture.image.width
      blurryCanvas.height = this.atlasTexture.image.height
      const ctx = blurryCanvas.getContext("2d")!
      ctx.filter = "blur(50px)"  // Reduced blur for smaller atlas
      ctx.drawImage(this.atlasTexture.image, 0, 0)
      this.blurryAtlasTexture = new THREE.Texture(blurryCanvas)
      this.blurryAtlasTexture.wrapS = THREE.ClampToEdgeWrapping
      this.blurryAtlasTexture.wrapT = THREE.ClampToEdgeWrapping
      this.blurryAtlasTexture.minFilter = THREE.LinearFilter
      this.blurryAtlasTexture.magFilter = THREE.LinearFilter
      this.blurryAtlasTexture.needsUpdate = true
      this.material.uniforms.uBlurryAtlas.value = this.blurryAtlasTexture
    } catch (err) {
      console.error('[Planes] Failed to create blurry atlas:', err)
    }
  }

  createMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uMaxXdisplacement: {
          value: new THREE.Vector2(
            this.shaderParameters.maxX,
            this.shaderParameters.maxY
          ),
        },
        uWrapperTexture: {
          // Not used - shader creates rounded corners via SDF
          value: null,
        },
        uAtlas: new THREE.Uniform(this.atlasTexture),
        uBlurryAtlas: new THREE.Uniform(this.blurryAtlasTexture),
        uScrollY: { value: 0 },
        uSpeedY: { value: 0 },
        uDrag: { value: new THREE.Vector2(0, 0) },
      },
    })
  }

  createInstancedMesh() {
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.meshCount
    )
    this.scene.add(this.mesh)
  }

  fillMeshData() {
    const initialPosition = new Float32Array(this.meshCount * 3)
    const meshSpeed = new Float32Array(this.meshCount)
    const aTextureCoords = new Float32Array(this.meshCount * 4)

    // Reset instance-to-photo mapping
    this.instanceToPhotoIndex = []

    for (let i = 0; i < this.meshCount; i++) {
      initialPosition[i * 3 + 0] =
        (Math.random() - 0.5) * this.shaderParameters.maxX * 2
      initialPosition[i * 3 + 1] =
        (Math.random() - 0.5) * this.shaderParameters.maxY * 2
      initialPosition[i * 3 + 2] = Math.random() * (7 - -30) - 30

      meshSpeed[i] = Math.random() * 0.5 + 0.5

      const imageIndex = i % this.imageInfos.length

      // Store mapping from instance → photo index
      this.instanceToPhotoIndex[i] = imageIndex

      aTextureCoords[i * 4 + 0] = this.imageInfos[imageIndex].uvs.xStart
      aTextureCoords[i * 4 + 1] = this.imageInfos[imageIndex].uvs.xEnd
      aTextureCoords[i * 4 + 2] = this.imageInfos[imageIndex].uvs.yStart
      aTextureCoords[i * 4 + 3] = this.imageInfos[imageIndex].uvs.yEnd
    }

    this.geometry.setAttribute(
      "aInitialPosition",
      new THREE.InstancedBufferAttribute(initialPosition, 3)
    )
    this.geometry.setAttribute(
      "aMeshSpeed",
      new THREE.InstancedBufferAttribute(meshSpeed, 1)
    )

    this.mesh.geometry.setAttribute(
      "aTextureCoords",
      new THREE.InstancedBufferAttribute(aTextureCoords, 4)
    )
  }

  bindDrag(element: HTMLElement) {
    this.dragElement = element

    const onPointerDown = (e: PointerEvent) => {
      this.drag.isDown = true
      this.drag.startX = e.clientX
      this.drag.startY = e.clientY
      this.drag.lastX = e.clientX
      this.drag.lastY = e.clientY
      element.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!this.drag.isDown) return
      const dx = e.clientX - this.drag.lastX
      const dy = e.clientY - this.drag.lastY
      this.drag.lastX = e.clientX
      this.drag.lastY = e.clientY

      const worldPerPixelX =
        (this.sizes.width / window.innerWidth) * this.dragSensitivity
      const worldPerPixelY =
        (this.sizes.height / window.innerHeight) * this.dragSensitivity

      this.drag.xTarget += -dx * worldPerPixelX
      this.drag.yTarget += dy * worldPerPixelY
    }

    const onPointerUp = (e: PointerEvent) => {
      this.drag.isDown = false
      try {
        element.releasePointerCapture(e.pointerId)
      } catch {}
    }

    element.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
  }

  onWheel(event: MouseEvent) {
    const normalizedWheel = normalizeWheel(event)

    let scrollY =
      (normalizedWheel.pixelY * this.sizes.height) / window.innerHeight

    this.scrollY.target += scrollY
    this.material.uniforms.uSpeedY.value += scrollY
  }

  render(delta: number) {
    this.material.uniforms.uTime.value += delta * 0.015

    this.drag.xCurrent +=
      (this.drag.xTarget - this.drag.xCurrent) * this.dragDamping
    this.drag.yCurrent +=
      (this.drag.yTarget - this.drag.yCurrent) * this.dragDamping

    this.material.uniforms.uDrag.value.set(
      this.drag.xCurrent,
      this.drag.yCurrent
    )

    this.scrollY.current = interpolate(
      this.scrollY.current,
      this.scrollY.target,
      0.12
    )

    this.material.uniforms.uScrollY.value = this.scrollY.current
    this.material.uniforms.uSpeedY.value *= 0.835
  }

  /**
   * Get photo index from instance ID
   */
  getPhotoIndexFromInstance(instanceId: number): number {
    return this.instanceToPhotoIndex[instanceId] ?? -1
  }

  /**
   * Get total number of unique photos loaded
   */
  getPhotoCount(): number {
    return this.imageInfos.length
  }
}

const interpolate = (current: number, target: number, ease: number) => {
  return current + (target - current) * ease
}
