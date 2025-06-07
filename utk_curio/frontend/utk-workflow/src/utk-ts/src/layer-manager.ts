// layers base classes
import { Layer } from './layer';
import { LayerType, OperationType, SpatialRelationType, LevelType } from './constants';
import { ILayerData, ILinkDescription, IJoinedObjects, ILayerFeature } from './interfaces';

// layer types
import { LinesLayer } from './layer-lines';
import { PointsLayer } from './layer-points';
import { TrianglesLayer } from './layer-triangles';
import { BuildingsLayer } from './layer-buildings';
import { HeatmapLayer } from './layer-heatmap';

export class LayerManager {
    // Loaded layers
    protected _layers: Layer[] = [];
    protected _filterBbox: number[] = []; // minx, miny, maxx, maxy
    protected _updateStatusCallback: any;
    protected _grammarInterpreter: any;

    constructor(grammarInterpreter: any) {
        this._grammarInterpreter = grammarInterpreter;
    }

    public init(updateStatusCallback: any | null = null){
        this._updateStatusCallback = updateStatusCallback;
    }

    /**
     * Layers vector accessor
     * @returns {Layer[]} The array of layers
     */
    get layers(): Layer[] {
        return this._layers;
    }

    set filterBbox(bbox: number[]){

        this._updateStatusCallback("filterKnots", bbox);

        this._filterBbox = bbox;

        for(const knot of this._grammarInterpreter.knotManager.knots){
            knot.physicalLayer.mesh.setFiltered(bbox);
            for(const key of Object.keys(knot.shaders)){
                let shaders = knot.shaders[key];
                for(const shader of shaders){
                    shader.setFiltered(knot.physicalLayer.mesh.filtered);
                    if(shader.currentKnot != undefined){ // if layer is being rendered
                        shader.updateShaderData(knot.physicalLayer.mesh, shader.currentKnot); // recalculating normalization
                    }
                }
            }
        }

    }

    /**
    * Creates a layer from the server
    * @param {string} layerType layer type
    * @param {string} layerId layer identifier
    * @returns {Layer | null} The load layer promise
    */
    createLayer(layerInfo: ILayerData, features: ILayerFeature[]): Layer | null {
        // loaded layer
        let layer = null;
        // z order
        let zOrder = this._layers.length+1;

        // loads based on type
        switch (layerInfo.type) {
            case LayerType.TRIANGLES_2D_LAYER:
                layer = new TrianglesLayer(layerInfo, 2, zOrder, features);
            break;
            case LayerType.TRIANGLES_3D_LAYER:
                layer = new TrianglesLayer(layerInfo, 3, zOrder, features);
            break;
            case LayerType.LINES_2D_LAYER:
                layer = new LinesLayer(layerInfo, 2, zOrder, features);
            break;
            case LayerType.LINES_3D_LAYER:
                layer = new LinesLayer(layerInfo, 3, zOrder, features);
            break;
            case LayerType.BUILDINGS_LAYER:
                layer = new BuildingsLayer(layerInfo, zOrder, features);
            break;
            case LayerType.HEATMAP_LAYER:
                layer = new HeatmapLayer(layerInfo, zOrder, features);
            break;
            case LayerType.POINTS_LAYER:
                layer = new PointsLayer(layerInfo, zOrder, features);
            break;
            default:
                console.error(`File ${layerInfo.id}.json has an unknown layer type: ${layerInfo.type}.`);
            break;
        }

        if (layer) {
            // adds the the list of layers
            this._layers.push(<Layer>layer);
        }

        // returns the layer
        return <Layer>layer;
    }

    getJoinedObjects(layer: Layer, linkDescription: ILinkDescription): IJoinedObjects | null{
        let targetLinkId: number = -1;
        let idCounter = 0;

        for(const joinedLayer of layer.joinedLayers){
            if(joinedLayer.abstract == linkDescription.abstract && linkDescription.in != undefined && joinedLayer.layerId == linkDescription.in.name && linkDescription.in.level == joinedLayer.inLevel 
                && linkDescription.spatial_relation == joinedLayer.spatial_relation && linkDescription.out.level == joinedLayer.outLevel){
                    targetLinkId = idCounter;
            }
            idCounter += 1;
        }

        if(targetLinkId == -1){
            return null;
        }
        
        for(const joinedObject of layer.joinedObjects){
            if(joinedObject.joinedLayerIndex == targetLinkId){
                return joinedObject;
            }
        }

        return null;
    }

    getValuesExKnot(layerId: string, in_name: string){
        let layer = <Layer>this.searchByLayerId(layerId);
        let externalJoinedJson = layer.externalJoinedJson;

        for(let i = 0; i < externalJoinedJson.incomingId.length; i++){
            if(externalJoinedJson.incomingId[i] == in_name){
                return externalJoinedJson.inValues[i];
            }
        }

        return [];
    }

    getAbstractDataFromLink(linkScheme: ILinkDescription[]): number[][] | null{
        
        if(linkScheme.length < 1){
            throw new Error("Can not get abstract data from link. Link scheme must have at least one element");
        }

        let functionValues: number[][] | null = null; // always in the coordinate level. Can contain multiple timestaps.

        if(linkScheme[0].abstract == false){
            throw new Error("The first link in the link scheme must be between an abstract and physical layer");
        }

        for(let i = 0; i < linkScheme.length; i++){

            let left_side = this.searchByLayerId(linkScheme[i].out.name);

            if(left_side == null){
                throw new Error("Layer "+linkScheme[i].out.name+" not found while trying to get abstract data from the link");
            }

            if(linkScheme[i].abstract == true){
                let joinedObjects = this.getJoinedObjects(left_side, linkScheme[i]);

                if(joinedObjects == null){
                    throw new Error("Joined objects not found in "+linkScheme[i].out.name);
                }

                if(joinedObjects != null && joinedObjects.inValues != undefined){
                    functionValues = [];

                    functionValues.push([]);

                    if(linkScheme[i].out.level == LevelType.COORDINATES || linkScheme[i].out.level == LevelType.COORDINATES3D){
                        for(const value of joinedObjects.inValues){
                            if(Array.isArray(value)){ // if value is array we are dealing with multiple timesteps
                                for(let k = 0; k < value.length; k++){
                                    if(k >= functionValues.length){
                                        functionValues.push([]);
                                    }
                                    functionValues[k].push(value[k]);
                                }
                            }else{ // only one timestep
                                functionValues[0].push(value);
                            }
                        }
                    }else if(linkScheme[i].out.level == LevelType.OBJECTS){ // distributing the values to the coordinates of the object
                        let coordsPerComp = left_side.mesh.getCoordsPerComp();
                        let distributedValues: number[][] = [];
                        distributedValues.push([]);

                        for(let j = 0; j < joinedObjects.inValues.length; j++){

                            let value = joinedObjects.inValues[j];

                            if(Array.isArray(value)){
                                for(let l = 0; l < value.length; l++){
                                    if(l >= distributedValues.length){
                                        distributedValues.push([]);
                                    }
                                    for(let k = 0; k < coordsPerComp[j]; k++){
                                        distributedValues[l].push(value[l]);
                                    }
                                }
                            }else{
                                distributedValues[0].push(value);
                            }
                        }

                        functionValues = distributedValues;
                    }
                }
            }
            
            // if(linkScheme[i].abstract == undefined){
            //     throw new Error("abstract field cannot be undefined when extracting function values");
            // }

            if(linkScheme[i].abstract == false){

                // inner operation (changing geometry levels inside the same layer)
                if(linkScheme[i].spatial_relation == SpatialRelationType.INNERAGG && functionValues != null && linkScheme[i].in != undefined && linkScheme[i].out.level != undefined){
                    // functionValues = left_side.innerAggFunc(functionValues, (<{name: string, level: LevelType}>linkScheme[i].in).level, <LevelType>linkScheme[i].out.level, <OperationType>linkScheme[i].operation);
                    throw new Error("INNERAGG is a deprecated spatial operation")
                }else if(functionValues != null && linkScheme[i].in != undefined && linkScheme[i].out.level != undefined){ // sjoin with another physical layer
                    
                    if((<{name: string, level: string}>linkScheme[i].in).name == linkScheme[i].out.name){
                        throw new Error("Only the spatial_relation INNERAGG can be used inside the context of the same layer");
                    }

                    let joinedObjects = this.getJoinedObjects(left_side, linkScheme[i]);

                    if(joinedObjects == null){
                        throw new Error("Joined objects not found in "+linkScheme[i].out.name);
                    }

                    if(joinedObjects != null && joinedObjects.inIds != undefined && linkScheme[i].in != undefined){

                        let joinedFunctionValues: any[] = []; // each position stores one timestep

                        let right_side = this.searchByLayerId((<{name: string, level: string}>linkScheme[i].in).name);

                        if(right_side == null){
                            throw new Error("Layer "+(<{name: string, level: string}>linkScheme[i].in).name+" not found while trying to get abstract data from the link");
                        }

                        for(let j = 0; j < joinedObjects.inIds.length; j++){
                            let idList = joinedObjects.inIds[j];

                            if(idList == null){
                                for(let k = 0; k < functionValues.length; k ++){
                                    if(k >= joinedFunctionValues.length){
                                        joinedFunctionValues.push([]);
                                    }

                                    joinedFunctionValues[k].push([null]);
                                }

                            }else{

                                let idsFuncValues: number[][] = []; // each position stores a timestep

                                for(const id of idList){
                                    for(let k = 0; k < functionValues.length; k ++){
                                        let functionIndex = right_side.getFunctionValueIndexOfId(id, (<{name: string, level: LevelType}>linkScheme[i].in).level);
                                        
                                        if(functionIndex == null){
                                            throw Error("Function index not found");
                                        }

                                        if(k >= idsFuncValues.length){
                                            idsFuncValues.push([]);
                                        }

                                        idsFuncValues[k].push(functionValues[k][functionIndex]);
                                    }
                                }

                                for(let k = 0; k < functionValues.length; k ++){
                                    if(k >= joinedFunctionValues.length){
                                        joinedFunctionValues.push([]);
                                    }

                                    joinedFunctionValues[k].push(idsFuncValues[k]);
                                }
                            }
                        }

                        let aggregatedValues: number[][] = [];

                        // aggregate values
                        for(let k = 0; k < joinedFunctionValues.length; k++){ // iterating over timesteps

                            if(k >= aggregatedValues.length){
                                aggregatedValues.push([]);
                            }

                            let currentJoinedFunctionValues = joinedFunctionValues[k];

                            for(let j = 0; j < currentJoinedFunctionValues.length; j++){
                                if(currentJoinedFunctionValues[j][0] != null){
    
                                    if(linkScheme[i].operation == OperationType.MAX){
                                        aggregatedValues[k].push(Math.max(...<number[]>currentJoinedFunctionValues[j]));
                                    }else if(linkScheme[i].operation == OperationType.MIN){
                                        aggregatedValues[k].push(Math.min(...<number[]>currentJoinedFunctionValues[j]));
                                    }else if(linkScheme[i].operation == OperationType.AVG){
                                        let sum = (<number[]>currentJoinedFunctionValues[j]).reduce((partialSum: number, value: number) => partialSum + value, 0);
                                        aggregatedValues[k].push(sum/currentJoinedFunctionValues[j].length);
                                    }else if(linkScheme[i].operation == OperationType.SUM){
                                        aggregatedValues[k].push((<number[]>currentJoinedFunctionValues[j]).reduce((partialSum: number, value: number) => partialSum + value, 0));
                                    }else if(linkScheme[i].operation == OperationType.COUNT){
                                        aggregatedValues[k].push((<number[]>currentJoinedFunctionValues[j]).length);
                                    }else if(linkScheme[i].operation == OperationType.NONE){
                                        throw new Error('NONE operation cannot be used with when linking two physical layers');
                                    }
                                }else{
                                    aggregatedValues[k].push(0); // TODO: which value to use with null joins?
                                }
                            }
                        }
                        
                        let distributedValues: number[][] = [];

                        if(linkScheme[i].out.level == LevelType.COORDINATES || linkScheme[i].out.level == LevelType.COORDINATES3D){
                            distributedValues = aggregatedValues;
                        }else if(linkScheme[i].out.level == LevelType.OBJECTS){
                            let coordsPerComp = left_side.mesh.getCoordsPerComp();

                            for(let l = 0; l < aggregatedValues.length; l++){ // iterating over timesteps
                                let currentAggregatedValues = aggregatedValues[l];

                                if(l >= distributedValues.length){
                                    distributedValues.push([]);
                                }

                                for(let j = 0; j < currentAggregatedValues.length; j++){
                                    for(let k = 0; k < coordsPerComp[j]; k++){
                                        distributedValues[l].push(currentAggregatedValues[j]);
                                    }
                                }
                            }
                        }

                        functionValues = distributedValues;

                    }
                }
            }
        }

        return functionValues;
    }

    searchByLayerInfo(layerInfo: ILayerData): Layer | null {
        // searches the layer
        let layer = null;
        for (const lay of this.layers) {
            if (lay.id === layerInfo.id) {
                layer = lay;
                break;
            }
        }
        return layer;
    }

    searchByLayerId(layerId: string): Layer | null {
        // searches the layer
        let layer = null;
        for (const lay of this.layers) {
            if (lay.id === layerId) {
                layer = lay;
                break;
            }
        }
        return layer;
    }
}
