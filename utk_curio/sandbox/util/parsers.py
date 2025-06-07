import rasterio
import geopandas as gpd
import pandas as pd
import json
import mmap
import zlib
import os
import time
import hashlib
import ast

from shapely import wkt

# Utility Functions
# transforms the whole input into a dict (json) in depth
# def toJsonInput(input):
#     print("here", input)
#     parsedJson = input
#     if(parsedJson['dataType'] == 'outputs'):
#         for key, elem in enumerate(parsedJson['data']):
#             parsedJson['data'][key] = toJsonInput(elem)

#     return parsedJson

# I/O Type Checking
def checkIOType(data, boxType, input=True):
    if input:
        validate_input(data, boxType)
    else:
        validate_output(data, boxType)


# Input Validation
def validate_input(data, boxType):
    if boxType in ['DATA_EXPORT', 'DATA_CLEANING']:
        check_dataframe_input(data, boxType)
    elif boxType == 'DATA_TRANSFORMATION':
        check_transformation_input(data, boxType)

# Output Validation
def validate_output(data, boxType):
    if boxType in ['DATA_LOADING', 'DATA_CLEANING', 'DATA_TRANSFORMATION']:
        check_valid_output(data, boxType)
    elif boxType == 'DATA_EXPORT':
        raise Exception(f'{boxType} does not support output')


# Input Type Checks
def check_dataframe_input(data, boxType):
    if data['dataType'] == 'outputs' and len(data['data']) > 1:
        raise Exception(f'{boxType} only supports one input')

    valid_types = {'dataframe', 'geodataframe'}
    if data['dataType'] == 'outputs':
        for elem in data['data']:
            if elem['dataType'] not in valid_types:
                raise Exception(f'{boxType} only supports DataFrame and GeoDataFrame as input')
    elif data['dataType'] not in valid_types:
        raise Exception(f'{boxType} only supports DataFrame and GeoDataFrame as input')

def check_transformation_input(data, boxType):
    valid_types = {'dataframe', 'geodataframe', 'raster'}
    if data['dataType'] == 'outputs' and len(data['data']) > 2:
        raise Exception(f'{boxType} only supports one or two inputs')

    if data['dataType'] == 'outputs':
        for elem in data['data']:
            if elem['dataType'] not in valid_types:
                raise Exception(f'{boxType} only supports DataFrame, GeoDataFrame, and Raster as input')
    elif data['dataType'] not in valid_types:
        raise Exception(f'{boxType} only supports DataFrame, GeoDataFrame, and Raster as input')

def check_valid_output(data, boxType):
    valid_types = {'dataframe', 'geodataframe', 'raster'}

    if data['dataType'] == 'outputs':
        if len(data['data']) > 1 and boxType != 'DATA_LOADING':
            raise Exception(f'{boxType} only supports one output')

        for elem in data['data']:
            if elem['dataType'] not in valid_types:
                raise Exception(f'{boxType} only supports DataFrame, GeoDataFrame, and Raster as output')

    elif data['dataType'] not in valid_types:
        raise Exception(f'{boxType} only supports DataFrame, GeoDataFrame, and Raster as output')

def save_memory_mapped_file(data, shared_disk_path='./.curio/data/'):
    """
    Saves the input data as a memory-mapped JSON file with a unique name.

    Args:
        input_data (dict): The data to be saved.
        shared_disk_path (str): Path to the directory for saving the file.

    Returns:
        str: The path of the saved memory-mapped file.
    """
    launch_dir = os.environ.get("CURIO_LAUNCH_CWD", os.getcwd())    
    resolved_path = os.path.join(launch_dir, shared_disk_path)
    # Ensure the directory exists
    os.makedirs(resolved_path, exist_ok=True)
    
    json_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
    input_hash = hashlib.sha256(json_bytes[:512]).digest()[:4].hex()

    # Create a unique filename using hash of the input and current time
    timestamp = str(int(time.time()))
    unique_filename = f"{timestamp}_{input_hash[:10]}.data" 
    file_path = os.path.join(resolved_path, unique_filename)

    # Save the input data directly without compression as a memory-mapped file
    compressed_data = zlib.compress(json_bytes)
    # compressed_data = json.dump(data, file, ensure_ascii=False) # json.dumps(data).encode('utf-8')
    with open(file_path, "wb") as file:
        file.write(compressed_data)
        file.flush()

    return file_path


def load_memory_mapped_file(file_path):
    """
    Loads the JSON data from the specified memory-mapped JSON file.

    Args:
        file_path (str): The path of the memory-mapped JSON file to load.

    Returns:
        dict: The loaded JSON data.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"The file {file_path} does not exist.")

    # Using mmap for efficient memory-mapped loading
    with open(file_path, "rb") as file:
        with mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ) as mmapped_file:
            # Decompress and decode directly from the memory-mapped file
            decompressed_data = zlib.decompress(mmapped_file[:])
            data = json.loads(decompressed_data.decode('utf-8'))
    return data


def parse_primitive(data_type, data_value):
    try:
        return ast.literal_eval(data_value)
    except (ValueError, SyntaxError):
        return data_value

def parse_list(data_type, data_value):
    values = []
    for elem in data_value:
        if type(elem) == dict and 'dataType' in elem:
            values.append(parseInput(elem))
        else:
            values.append(elem)
    return values

def parse_dataframe(data_value):
    return pd.DataFrame.from_dict(data_value)

def parse_geodataframe(data_value):
    # df = pd.DataFrame.from_dict(data_value)
    # df['geometry'] = df['geometry'].apply(wkt.loads)
    # gdf = gpd.GeoDataFrame(df, geometry='geometry')
    gdf = gpd.GeoDataFrame.from_features(data_value["features"])
    if 'metadata' in data_value and 'name' in data_value['metadata']:
        gdf.metadata = {'name': data_value['metadata']['name']}
    
    return gdf

def parse_raster(data_value):
    return rasterio.open(data_value)

# Parsing Functions
def parseInput(parsed_json):
    # parsed_json = json.loads(input_str)

    data_type = parsed_json.get('dataType')
    data_value = parsed_json.get('data')

    if data_type in ['int', 'float', 'bool', 'dict', 'str']:
        return parse_primitive(data_type, data_value)
    elif data_type == 'list':
        return parse_list(data_type, data_value)
    elif data_type == 'dataframe':
        return parse_dataframe(data_value)
    elif data_type == 'geodataframe':
        return parse_geodataframe(data_value)
    elif data_type == 'raster':
        return parse_raster(data_value)
    elif data_type == 'outputs':
        return tuple(parseInput(elem) for elem in data_value)

    return None

# Output Functions
def parseOutput(output):
    json_output = {'data': '', 'dataType': ''}
    if isinstance(output, (int, float, bool, str)):
        json_output['data'] = output
        json_output['dataType'] = type(output).__name__
    elif isinstance(output, list):
        json_output['data'] = [parseOutput(elem) for elem in output]
        json_output['dataType'] = type(output).__name__
    elif isinstance(output, dict):
        json_output['data'] = output
        json_output['dataType'] = type(output).__name__
    elif isinstance(output, pd.DataFrame) and not isinstance(output, gpd.GeoDataFrame):
        json_output['data'] = output.to_dict(orient='list')
        json_output['dataType'] = 'dataframe'
    elif isinstance(output, gpd.GeoDataFrame):
        # output['geometry'] = output['geometry'].apply(lambda geom: geom.wkt)
        # json_output['data'] = output.to_dict(orient='list')
        json_output['data'] = output.__geo_interface__
        json_output['dataType'] = 'geodataframe'
        if hasattr(output, 'metadata') and 'name' in output.metadata:
            parsed_geojson = json_output['data']
            parsed_geojson['metadata'] = {'name': output.metadata['name']}
            json_output['data'] = parsed_geojson
    elif isinstance(output, rasterio.io.DatasetReader):
        json_output['data'] = output.name
        json_output['dataType'] = 'raster'
    elif isinstance(output, tuple):
        json_output['data'] = [parseOutput(elem) for elem in output]
        json_output['dataType'] = 'outputs'

    return json_output
