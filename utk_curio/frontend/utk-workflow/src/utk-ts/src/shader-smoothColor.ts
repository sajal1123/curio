import { Shader } from "./shader";
import { Mesh } from "./mesh";

// @ts-ignore
import vsSmoothColor from './shaders/smoothColor.vs';
// @ts-ignore
import fsSmoothColor from './shaders/smoothColor.fs';

import { IExKnot, IKnot } from "./interfaces";

export class ShaderSmoothColor extends Shader {

    // Data to be rendered
    protected _coords:  number[] = [];
    protected _normals: number[] = [];
    protected _indices: number[] = [];
    protected _coordsPerComp: number[] = [];

    // Global color used on the layer
    protected _globalColor: number[] = [];

    // Data loaction on GPU
    protected _glCoords:  WebGLBuffer | null = null;
    protected _glNormals: WebGLBuffer | null = null;
    protected _glIndices: WebGLBuffer | null = null;
    protected _glFiltered: WebGLBuffer | null = null;

    // Data has chaged
    protected _coordsDirty: boolean = false;
    protected _filteredDirty: boolean = false;

    // Id of each property in the VAO
    protected _coordsId = -1;
    protected _normalsId = -1;
    protected _filteredId = -1;

    // Uniforms location
    protected _uModelViewMatrix: WebGLUniformLocation | null = null;
    protected _uProjectionMatrix: WebGLUniformLocation | null = null;
    protected _uWorldOrigin: WebGLUniformLocation | null = null;
    protected _uGlobalColor: WebGLUniformLocation | null = null;

    protected _filtered: number[] = [];

    constructor(glContext: WebGL2RenderingContext, color: number[], grammarInterpreter: any) {
        super(vsSmoothColor, fsSmoothColor, glContext, grammarInterpreter);

        // saves the layer color
        this._globalColor = color;

        // creathe dhe shader variables
        this.createUniforms(glContext);
        this.createVertexArrayObject(glContext);
    }

    public updateShaderGeometry(mesh: Mesh, centroid:number[] | Float32Array = [0,0,0], viewId: number) {
        this._coordsDirty = true;
        this._filteredDirty = true;
        this._coords = mesh.getCoordinatesVBO(centroid, viewId);
        this._normals = mesh.getNormalsVBO();
        this._indices = mesh.getIndicesVBO();
        this._coordsPerComp = mesh.getCoordsPerComp();

        let totalNumberOfCoords = mesh.getTotalNumberOfCoords()

        for(let i = 0; i < totalNumberOfCoords; i++){
            this._filtered.push(1.0); // 1 true to include
        }
    }

    public updateShaderData(mesh: Mesh, knot: IKnot | IExKnot, currentTimestepFunction: number = 0): void {
        return;
    }

    public updateShaderUniforms(data: any) {
        this._globalColor = <number[]> data;
    }

    public createUniforms(glContext: WebGL2RenderingContext): void {
        if (!this._shaderProgram) {
            return;
        }

        this._uModelViewMatrix = glContext.getUniformLocation(this._shaderProgram, 'uModelViewMatrix');
        this._uProjectionMatrix = glContext.getUniformLocation(this._shaderProgram, 'uProjectionMatrix');
        this._uWorldOrigin = glContext.getUniformLocation(this._shaderProgram, 'uWorldOrigin');
        this._uGlobalColor = glContext.getUniformLocation(this._shaderProgram, 'uGlobalColor');
    }

    public bindUniforms(glContext: WebGL2RenderingContext, camera: any): void {
        if (!this._shaderProgram) {
            return;
        }

        glContext.uniformMatrix4fv(this._uModelViewMatrix, false, camera.getModelViewMatrix());
        glContext.uniformMatrix4fv(this._uProjectionMatrix, false, camera.getProjectionMatrix());
        glContext.uniform2fv(this._uWorldOrigin, camera.getWorldOrigin());
        glContext.uniform3fv(this._uGlobalColor, this._globalColor);
    }

    public createTextures(glContext: WebGL2RenderingContext): void {
        throw new Error("Method not implemented.");
    }

    public bindTextures(glContext: WebGL2RenderingContext): void {
        throw new Error("Method not implemented.");
    }

    public createVertexArrayObject(glContext: WebGL2RenderingContext): void {
        if (!this._shaderProgram) {
            return;
        }

        // Creates the coords id.
        this._coordsId = glContext.getAttribLocation(this._shaderProgram, 'vertCoords');
        // Create a buffer for the positions.
        this._glCoords = glContext.createBuffer();

        // Creates the coords id.
        this._normalsId = glContext.getAttribLocation(this._shaderProgram, 'vertNormals');
        // Create a buffer for the positions.
        this._glNormals = glContext.createBuffer();

        this._filteredId = glContext.getAttribLocation(this._shaderProgram, 'inFiltered');
        this._glFiltered = glContext.createBuffer();

        // Creates the elements buffer
        this._glIndices = glContext.createBuffer();
    }

    public bindVertexArrayObject(glContext: WebGL2RenderingContext, mesh: Mesh): void {
        if (!this._shaderProgram) {
            return;
        }

        // binds the position buffer
        glContext.bindBuffer(glContext.ARRAY_BUFFER, this._glCoords);

        // send data to gpu
        if (this._coordsDirty) {
            glContext.bufferData(
                glContext.ARRAY_BUFFER, new Float32Array(this._coords), glContext.STATIC_DRAW
            );
        }
        // binds the VAO
        glContext.vertexAttribPointer(this._coordsId, mesh.dimension, glContext.FLOAT, false, 0, 0);
        glContext.enableVertexAttribArray(this._coordsId);

        glContext.bindBuffer(glContext.ARRAY_BUFFER, this._glFiltered);
        if (this._filteredDirty) {
            glContext.bufferData(
                glContext.ARRAY_BUFFER, new Float32Array(this._filtered), glContext.STATIC_DRAW
            );
        }

        glContext.vertexAttribPointer(this._filteredId, 1, glContext.FLOAT, false, 0, 0);
        glContext.enableVertexAttribArray(this._filteredId); 

        // binds the position buffer
        glContext.bindBuffer(glContext.ARRAY_BUFFER, this._glNormals);

        // send data to gpu
        if (this._coordsDirty) {
            glContext.bufferData(
                glContext.ARRAY_BUFFER, new Float32Array(this._normals), glContext.STATIC_DRAW
            );
        }
        // binds the VAO
        glContext.vertexAttribPointer(this._normalsId, mesh.dimension, glContext.FLOAT, false, 0, 0);
        glContext.enableVertexAttribArray(this._normalsId);

        // binds the indices buffer
        glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, this._glIndices);

        // send data to gpu
        if (this._coordsDirty) {
            glContext.bufferData(
            glContext.ELEMENT_ARRAY_BUFFER, new Uint32Array(this._indices), glContext.STATIC_DRAW);
        }

        this._coordsDirty = false;
        this._filteredDirty = false;
    }

    public setFiltered(filtered: number[]){ 
        if(filtered.length == 0){
            this._filtered = Array(this._filtered.length).fill(1.0);
        }else{
            this._filtered = filtered;
        }
        this._filteredDirty = true;
    }

    public setHighlightElements(coordinates: number[], value: boolean): void {
        throw Error("The smooth color shader can not highlight elements yet");
    }

    public renderPass(glContext: WebGL2RenderingContext, glPrimitive: number, camera: any, mesh: Mesh, zOrder: number): void {
        if (!this._shaderProgram) {
            return;
        }

        glContext.useProgram(this._shaderProgram);

        this.bindUniforms(glContext, camera);

        if(glPrimitive != glContext.POINTS){
            glContext.stencilFunc(
                glContext.GEQUAL,     // the test
                zOrder,            // reference value
                0xFF,         // mask
            );

            glContext.stencilOp(
                glContext.KEEP,     // what to do if the stencil test fails
                glContext.KEEP,     // what to do if the depth test fails
                glContext.REPLACE,     // what to do if both tests pass
            );
        }

        this.bindVertexArrayObject(glContext, mesh);

        if(glPrimitive == glContext.LINE_STRIP){ 
            let alreadyDrawn = 0;

            for(let i = 0; i < this._coordsPerComp.length; i++){ // draw each component individually
                glContext.drawArrays(glPrimitive, alreadyDrawn, this._coordsPerComp[i]);
                alreadyDrawn += this._coordsPerComp[i];

            }
        }else if(glPrimitive == glContext.POINTS){
            glContext.drawElements(glPrimitive, this._coords.length/3, glContext.UNSIGNED_INT, 0);
        }else{
            // draw the geometry
            glContext.drawElements(glPrimitive, this._indices.length, glContext.UNSIGNED_INT, 0);
        }
    }
}